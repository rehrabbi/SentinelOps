package main

// Integration tests: real HTTP requests through the real router (newHandler),
// its middleware and its SQL, against a throwaway Postgres database.
//
// They need TEST_DATABASE_URL pointing at a LOCAL Postgres whose user may
// create databases, for example the Compose one:
//
//	TEST_DATABASE_URL=postgres://sentinel:change-me-locally@localhost:5432/sentinelops?sslmode=disable go test ./...
//
// Each run creates its own database (sentinelops_test_<random>), migrates it,
// and drops it afterwards. A fresh database, rather than emptying tables, is
// required because audit_log refuses TRUNCATE and DELETE by design. Without
// TEST_DATABASE_URL these tests skip locally and fail in CI.

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sentinelops/internal/audit"
	"sentinelops/internal/invite"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

// testDB is the migrated throwaway database, or nil when tests are skipped.
var testDB *sql.DB

func TestMain(m *testing.M) {
	os.Exit(runWithTestDatabase(m))
}

func runWithTestDatabase(m *testing.M) int {
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		// GitHub Actions sets CI=true. A suite that silently skips in CI is
		// worse than one that fails, because a green check would mean nothing.
		if os.Getenv("CI") != "" {
			fmt.Fprintln(os.Stderr, "TEST_DATABASE_URL must be set in CI")
			return 1
		}
		fmt.Println("TEST_DATABASE_URL not set: integration tests skip (see CONTRIBUTING.md)")
		return m.Run()
	}

	// Never anywhere but this machine: a mistyped variable must not be able
	// to point the tests at the production database.
	u, err := url.Parse(base)
	if err != nil {
		fmt.Fprintf(os.Stderr, "TEST_DATABASE_URL is not a URL: %v\n", err)
		return 1
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1":
	default:
		fmt.Fprintf(os.Stderr, "TEST_DATABASE_URL must point at localhost, not %q\n", u.Hostname())
		return 1
	}

	admin, err := sql.Open("pgx", base)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open test server: %v\n", err)
		return 1
	}
	defer admin.Close()

	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		fmt.Fprintf(os.Stderr, "random name: %v\n", err)
		return 1
	}
	// The name is generated here, never taken from input, so building the
	// statement from it is safe (CREATE DATABASE takes no parameters).
	name := "sentinelops_test_" + hex.EncodeToString(suffix)
	ctx := context.Background()
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+name); err != nil {
		fmt.Fprintf(os.Stderr, "create %s: %v\n", name, err)
		return 1
	}
	defer func() {
		if _, err := admin.ExecContext(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)"); err != nil {
			fmt.Fprintf(os.Stderr, "drop %s: %v\n", name, err)
		}
	}()

	u.Path = "/" + name
	db, err := openDB(u.String())
	if err != nil {
		fmt.Fprintf(os.Stderr, "open %s: %v\n", name, err)
		return 1
	}
	defer db.Close()
	if err := runMigrateUp(db); err != nil {
		fmt.Fprintf(os.Stderr, "migrate %s: %v\n", name, err)
		return 1
	}

	testDB = db
	return m.Run()
}

// ---- helpers ----------------------------------------------------------------

func requireDB(t *testing.T) {
	t.Helper()
	if testDB == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
}

const testPassword = "correct-horse-battery" // 21 characters, local-only test value

// newServer serves the real API for one test and closes it afterwards.
func newServer(t *testing.T, cfg serverConfig) *httptest.Server {
	t.Helper()
	requireDB(t)
	if cfg.FrontendOrigin == "" {
		cfg.FrontendOrigin = "http://localhost:5173"
	}
	srv := httptest.NewServer(newHandler(testDB, cfg))
	t.Cleanup(srv.Close)
	return srv
}

// client is one browser: its own cookie jar, plus headers it sends every time.
type client struct {
	t      *testing.T
	base   string
	http   *http.Client
	header http.Header
	last   *http.Response // the most recent response, for header and cookie checks
}

func newClient(t *testing.T, srv *httptest.Server) *client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &client{t: t, base: srv.URL, http: &http.Client{Jar: jar}, header: http.Header{}}
}

// do sends a request with an optional JSON body and returns the status and body.
func (c *client) do(method, path string, body any) (int, string) {
	c.t.Helper()
	var reader io.Reader
	if body != nil {
		if raw, ok := body.(string); ok {
			reader = strings.NewReader(raw) // already JSON, possibly malformed on purpose
		} else {
			b, err := json.Marshal(body)
			if err != nil {
				c.t.Fatal(err)
			}
			reader = bytes.NewReader(b)
		}
	}
	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		c.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range c.header {
		req.Header[k] = v
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		c.t.Fatal(err)
	}
	c.last = resp
	return resp.StatusCode, string(b)
}

// expect fails the test unless the status matches.
func (c *client) expect(want int, method, path string, body any) string {
	c.t.Helper()
	got, text := c.do(method, path, body)
	if got != want {
		c.t.Fatalf("%s %s: status %d, want %d; body %q", method, path, got, want, text)
	}
	return text
}

var emailCounter atomic.Int64

// uniqueEmail keeps tests independent inside one shared database.
func uniqueEmail(prefix string) string {
	return fmt.Sprintf("%s-%d@example.test", prefix, emailCounter.Add(1))
}

type testUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// createAccount makes an account the only way there is: issue an invite (as
// the command line would) and accept it. It goes straight to the invite
// package rather than HTTP, so helper accounts never use up the per-visitor
// accept limit that the invite tests exercise.
func createAccount(t *testing.T, prefix, role string) testUser {
	t.Helper()
	requireDB(t)
	ctx := context.Background()
	token, _, err := invite.Issue(ctx, testDB, audit.NewRepository(testDB), uniqueEmail(prefix), role, nil, nil)
	if err != nil {
		t.Fatalf("issue invite: %v", err)
	}
	u, err := invite.Accept(ctx, testDB, user.NewRepository(testDB), audit.NewRepository(testDB), token, prefix, testPassword, nil)
	if err != nil {
		t.Fatalf("accept invite: %v", err)
	}
	return testUser{ID: u.ID, Email: u.Email, Role: u.Role}
}

// signUp creates an account with role ("" means reporter) and returns a
// client logged in as it.
func signUp(t *testing.T, srv *httptest.Server, prefix, role string) (*client, testUser) {
	t.Helper()
	u := createAccount(t, prefix, role)
	c := newClient(t, srv)
	c.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": u.Email, "password": testPassword})
	return c, u
}

// auditIP returns the address recorded on the newest audit entry for an actor.
func auditIP(t *testing.T, actorEmail, action string) string {
	t.Helper()
	var ip sql.NullString
	err := testDB.QueryRow(`SELECT ip::text FROM audit_log WHERE actor_email = $1 AND action = $2
	                        ORDER BY id DESC LIMIT 1`, actorEmail, action).Scan(&ip)
	if err != nil {
		t.Fatalf("audit entry %s for %s: %v", action, actorEmail, err)
	}
	return strings.TrimSuffix(ip.String, "/32")
}

// ---- tests ------------------------------------------------------------------

func TestHealthAndReadiness(t *testing.T) {
	c := newClient(t, newServer(t, serverConfig{}))
	c.expect(http.StatusOK, "GET", "/healthz", nil)
	c.expect(http.StatusOK, "GET", "/readyz", nil)
}

func TestOpenSignUpIsGone(t *testing.T) {
	c := newClient(t, newServer(t, serverConfig{}))
	// Only GET /api/users (admin-only) remains on that path.
	c.expect(http.StatusMethodNotAllowed, "POST", "/api/users",
		map[string]string{"fullName": "X", "email": uniqueEmail("open"), "password": testPassword})
}

func TestInvites(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, adminUser := signUp(t, srv, "inviter", "admin")
	reporter, reporterUser := signUp(t, srv, "plain", "")
	anonymous := newClient(t, srv)

	email := uniqueEmail("invitee")
	body := map[string]string{"email": email, "role": "analyst"}
	anonymous.expect(http.StatusUnauthorized, "POST", "/api/invites", body)
	reporter.expect(http.StatusForbidden, "POST", "/api/invites", body)
	admin.expect(http.StatusBadRequest, "POST", "/api/invites", map[string]string{"email": "not-an-email"})
	admin.expect(http.StatusBadRequest, "POST", "/api/invites", map[string]string{"email": email, "role": "superuser"})
	admin.expect(http.StatusBadRequest, "POST", "/api/invites", `{"email":"x@example.test","expiresAt":"2099-01-01T00:00:00Z"}`)
	admin.expect(http.StatusConflict, "POST", "/api/invites", map[string]string{"email": reporterUser.Email})

	text := admin.expect(http.StatusCreated, "POST", "/api/invites", map[string]string{"email": strings.ToUpper(email), "role": "analyst"})
	if cc := admin.last.Header.Get("Cache-Control"); cc != "no-store" {
		t.Errorf("invite response Cache-Control = %q, want no-store", cc)
	}
	var issued struct {
		Email, Role, Token string
		ExpiresAt          time.Time
	}
	if err := json.Unmarshal([]byte(text), &issued); err != nil {
		t.Fatal(err)
	}
	if issued.Email != email || issued.Role != "analyst" || len(issued.Token) != 64 {
		t.Errorf("issued = %+v; want the normalised email, role analyst, a 64-character token", issued)
	}
	if left := time.Until(issued.ExpiresAt); left < 23*time.Hour || left > 25*time.Hour {
		t.Errorf("invite expires in %v, want about 24h", left)
	}

	// Only the token's hash is stored.
	var raw, hashed int
	testDB.QueryRow(`SELECT count(*) FROM invites WHERE token_hash = $1`, issued.Token).Scan(&raw)
	testDB.QueryRow(`SELECT count(*) FROM invites WHERE token_hash = $1`, session.HashToken(issued.Token)).Scan(&hashed)
	if raw != 0 || hashed != 1 {
		t.Errorf("invites rows by raw token: %d, by hash: %d; want 0 and 1", raw, hashed)
	}

	invitee := newClient(t, srv)
	accept := func(token, password string) map[string]string {
		return map[string]string{"token": token, "fullName": "New Analyst", "password": password}
	}
	// A rule violation leaves the invite usable.
	invitee.expect(http.StatusBadRequest, "POST", "/api/invites/accept", accept(issued.Token, "too-short"))
	text = invitee.expect(http.StatusCreated, "POST", "/api/invites/accept", accept(issued.Token, testPassword))
	var created testUser
	if err := json.Unmarshal([]byte(text), &created); err != nil || created.Email != email || created.Role != "analyst" {
		t.Errorf("accepted account = %+v (%v); want %s as analyst", created, err, email)
	}
	if strings.Contains(strings.ToLower(text), "password") {
		t.Errorf("accept response mentions a password: %s", text)
	}
	var hash string
	testDB.QueryRow(`SELECT password_hash FROM users WHERE email = $1`, email).Scan(&hash)
	if !strings.HasPrefix(hash, "$2") {
		t.Error("password not stored as a bcrypt hash")
	}
	invitee.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": email, "password": testPassword})

	// Single use.
	invitee.expect(http.StatusNotFound, "POST", "/api/invites/accept", accept(issued.Token, testPassword))

	for action, actor := range map[string]string{audit.ActionInvited: adminUser.Email, audit.ActionInviteAccepted: email} {
		var target string
		err := testDB.QueryRow(`SELECT target_id FROM audit_log WHERE action = $1 AND actor_email = $2 ORDER BY id DESC LIMIT 1`,
			action, actor).Scan(&target)
		if err != nil || target != email {
			t.Errorf("audit %s by %s: target %q, err %v", action, actor, target, err)
		}
	}
}

func TestInviteEdgeCases(t *testing.T) {
	srv := newServer(t, serverConfig{})
	c := newClient(t, srv)
	ctx := context.Background()
	auditLog := audit.NewRepository(testDB)
	accept := func(token string) map[string]string {
		return map[string]string{"token": token, "fullName": "Edge", "password": testPassword}
	}

	// Expired, malformed, and unknown tokens all look the same.
	expired, _, err := invite.Issue(ctx, testDB, auditLog, uniqueEmail("expired"), "", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testDB.Exec(`UPDATE invites SET expires_at = now() - interval '1 minute' WHERE token_hash = $1`, session.HashToken(expired)); err != nil {
		t.Fatal(err)
	}
	a := c.expect(http.StatusNotFound, "POST", "/api/invites/accept", accept(expired))
	b := c.expect(http.StatusNotFound, "POST", "/api/invites/accept", accept("not-a-token"))
	d := c.expect(http.StatusNotFound, "POST", "/api/invites/accept", accept(strings.Repeat("ab", 32)))
	if a != b || b != d {
		t.Errorf("unusable tokens are distinguishable: %q %q %q", a, b, d)
	}

	// Two invites for one address: the second cannot create a duplicate, and
	// stays unused because the failed acceptance is rolled back.
	email := uniqueEmail("twice")
	first, _, err := invite.Issue(ctx, testDB, auditLog, email, "", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := invite.Issue(ctx, testDB, auditLog, email, "", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.expect(http.StatusCreated, "POST", "/api/invites/accept", accept(first))
	c.expect(http.StatusConflict, "POST", "/api/invites/accept", accept(second))
	var used sql.NullTime
	testDB.QueryRow(`SELECT used_at FROM invites WHERE token_hash = $1`, session.HashToken(second)).Scan(&used)
	if used.Valid {
		t.Error("a rejected acceptance marked the invite used")
	}
}

func TestInviteCommand(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	var out bytes.Buffer
	email := uniqueEmail("cli-admin")
	if err := runInvite(ctx, testDB, []string{"--email", email, "--role", "admin", "--site", "https://example.test/"}, &out); err != nil {
		t.Fatalf("invite command: %v", err)
	}
	link := regexp.MustCompile(`https://example\.test/invite#([0-9a-f]{64})`).FindStringSubmatch(out.String())
	if link == nil {
		t.Fatalf("no invite link in output: %q", out.String())
	}
	u, err := invite.Accept(ctx, testDB, user.NewRepository(testDB), audit.NewRepository(testDB), link[1], "First Admin", testPassword, nil)
	if err != nil || u.Role != "admin" {
		t.Fatalf("accepting the command-line invite: %+v, %v", u, err)
	}
	var actor string
	testDB.QueryRow(`SELECT actor_email FROM audit_log WHERE action = $1 AND target_id = $2`, audit.ActionInvited, email).Scan(&actor)
	if actor != "command-line" {
		t.Errorf("command-line invite audited as %q", actor)
	}

	out.Reset()
	if err := runInvite(ctx, testDB, []string{"--role", "admin"}, &out); err == nil {
		t.Error("invite without --email succeeded")
	}
	if err := runInvite(ctx, testDB, []string{"--email", uniqueEmail("x"), "--role", "root"}, &out); err == nil {
		t.Error("invite with an invalid role succeeded")
	}
}

func TestLoginSessionAndLogout(t *testing.T) {
	srv := newServer(t, serverConfig{})
	_, u := signUp(t, srv, "login", "")
	c := newClient(t, srv)

	// A wrong password and an unknown email must be indistinguishable.
	_, wrongPassword := c.do("POST", "/api/sessions", map[string]string{"email": u.Email, "password": "wrong-password-123"})
	status, unknownEmail := c.do("POST", "/api/sessions", map[string]string{"email": uniqueEmail("ghost"), "password": testPassword})
	if status != http.StatusUnauthorized || wrongPassword != unknownEmail {
		t.Errorf("unknown email: %d %q, wrong password: %q; want identical 401s", status, unknownEmail, wrongPassword)
	}
	c.expect(http.StatusUnauthorized, "GET", "/api/me", nil)

	c.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": u.Email, "password": testPassword})
	var session *http.Cookie
	for _, ck := range c.last.Cookies() {
		if ck.Name == "sentinelops_session" {
			session = ck
		}
	}
	if session == nil {
		t.Fatal("login set no session cookie")
	}
	if !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.Path != "/" || session.MaxAge != 7*24*60*60 {
		t.Errorf("cookie = %+v; want HttpOnly, SameSite=Lax, Path=/, seven days", session)
	}

	// Only the token's SHA-256 is stored, never the token itself.
	var stored int
	if err := testDB.QueryRow(`SELECT count(*) FROM sessions WHERE token_hash = $1`, session.Value).Scan(&stored); err != nil || stored != 0 {
		t.Errorf("raw token found in sessions (%d, %v)", stored, err)
	}

	text := c.expect(http.StatusOK, "GET", "/api/me", nil)
	if !strings.Contains(text, u.Email) || strings.Contains(strings.ToLower(text), "password") {
		t.Errorf("/api/me = %s", text)
	}

	c.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil)
	c.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	c.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil) // idempotent
}

func TestSecureCookieFlag(t *testing.T) {
	srv := newServer(t, serverConfig{SecureCookies: true})
	u := createAccount(t, "secure", "")
	c := newClient(t, srv)
	c.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": u.Email, "password": testPassword})
	for _, ck := range c.last.Cookies() {
		if ck.Name == "sentinelops_session" && !ck.Secure {
			t.Error("SecureCookies is on but the session cookie is not Secure")
		}
	}
}

func TestIncidentAuthorization(t *testing.T) {
	srv := newServer(t, serverConfig{})
	owner, ownerUser := signUp(t, srv, "owner", "")
	other, _ := signUp(t, srv, "other", "")
	analyst, _ := signUp(t, srv, "analyst", "analyst")

	newClient(t, srv).expect(http.StatusUnauthorized, "GET", "/api/incidents", nil)

	text := owner.expect(http.StatusCreated, "POST", "/api/incidents",
		map[string]string{"title": "Phishing email", "description": "Reported by finance", "severity": "high"})
	var inc struct {
		ID     string `json:"id"`
		UserID string `json:"userId"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(text), &inc); err != nil {
		t.Fatal(err)
	}
	if inc.UserID != ownerUser.ID || inc.Status != "open" {
		t.Errorf("created incident = %+v; want owner %s and status open", inc, ownerUser.ID)
	}

	// The client cannot choose the owner or the starting status.
	owner.expect(http.StatusBadRequest, "POST", "/api/incidents",
		`{"title":"x","severity":"low","status":"closed"}`)
	owner.expect(http.StatusBadRequest, "POST", "/api/incidents",
		map[string]string{"title": "x", "severity": "catastrophic"})

	path := "/api/incidents/" + inc.ID

	// Another reporter gets 404, never 403, so the incident's existence leaks nothing.
	other.expect(http.StatusNotFound, "GET", path, nil)
	other.expect(http.StatusNotFound, "PATCH", path, map[string]string{"status": "closed"})
	if list := other.expect(http.StatusOK, "GET", "/api/incidents", nil); strings.Contains(list, inc.ID) {
		t.Error("another reporter's list includes the incident")
	}

	analyst.expect(http.StatusOK, "GET", path, nil)
	if list := analyst.expect(http.StatusOK, "GET", "/api/incidents", nil); !strings.Contains(list, inc.ID) {
		t.Error("an analyst's list is missing the incident")
	}

	owner.expect(http.StatusOK, "PATCH", path, map[string]string{"status": "investigating"})
	if got := owner.expect(http.StatusOK, "GET", path, nil); !strings.Contains(got, `"status":"investigating"`) {
		t.Errorf("status change did not persist: %s", got)
	}
	owner.expect(http.StatusBadRequest, "PATCH", path, map[string]string{"status": "done"})
	owner.expect(http.StatusBadRequest, "PATCH", path, map[string]string{})

	// A malformed id is a 404 too, and never reaches Postgres as a 500.
	owner.expect(http.StatusNotFound, "GET", "/api/incidents/not-a-uuid", nil)
}

func TestRoleManagement(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, adminUser := signUp(t, srv, "admin", "admin")
	reporter, reporterUser := signUp(t, srv, "reporter", "")

	reporter.expect(http.StatusForbidden, "GET", "/api/users", nil)
	reporter.expect(http.StatusForbidden, "PATCH", "/api/users/"+adminUser.ID, map[string]string{"role": "reporter"})
	admin.expect(http.StatusOK, "GET", "/api/users", nil)

	admin.expect(http.StatusOK, "PATCH", "/api/users/"+reporterUser.ID, map[string]string{"role": "analyst"})
	// Roles are read from the database on every request: the same session sees it at once.
	if me := reporter.expect(http.StatusOK, "GET", "/api/me", nil); !strings.Contains(me, `"role":"analyst"`) {
		t.Errorf("role change not visible to the existing session: %s", me)
	}

	admin.expect(http.StatusForbidden, "PATCH", "/api/users/"+adminUser.ID, map[string]string{"role": "reporter"})
	admin.expect(http.StatusBadRequest, "PATCH", "/api/users/"+reporterUser.ID, map[string]string{"role": "superuser"})

	var target string
	err := testDB.QueryRow(`SELECT target_id FROM audit_log WHERE action = $1 AND actor_email = $2
	                        ORDER BY id DESC LIMIT 1`, audit.ActionRoleChanged, adminUser.Email).Scan(&target)
	if err != nil || target != reporterUser.ID {
		t.Errorf("role change audit entry: target %q, err %v; want %s", target, err, reporterUser.ID)
	}
}

func TestAuditLogIsAppendOnlyAndChained(t *testing.T) {
	srv := newServer(t, serverConfig{})
	c := newClient(t, srv)
	ghost := uniqueEmail("audit-ghost")
	c.expect(http.StatusUnauthorized, "POST", "/api/sessions", map[string]string{"email": ghost, "password": testPassword})
	if ip := auditIP(t, ghost, audit.ActionLoginFailed); ip != "127.0.0.1" {
		t.Errorf("failed login recorded from %q, want 127.0.0.1", ip)
	}

	for _, stmt := range []string{
		`UPDATE audit_log SET actor_email = 'someone-else@example.test'`,
		`DELETE FROM audit_log`,
		`TRUNCATE audit_log`,
	} {
		if _, err := testDB.Exec(stmt); err == nil {
			t.Errorf("%q succeeded; the audit log must refuse it", stmt)
		}
	}

	report, err := audit.Verify(context.Background(), testDB)
	if err != nil || !report.Intact() || report.Entries == 0 {
		t.Fatalf("audit chain: %+v, %v", report, err)
	}
	head := audit.Anchor{ID: report.HeadID, Hash: report.HeadHash}
	if err := audit.CheckAnchor(context.Background(), testDB, head); err != nil {
		t.Errorf("the current head does not hold as an anchor: %v", err)
	}
	wrong := audit.Anchor{ID: report.HeadID, Hash: strings.Repeat("0", 64)}
	if err := audit.CheckAnchor(context.Background(), testDB, wrong); err == nil {
		t.Error("a wrong anchor was accepted")
	}
}

func TestProxySecret(t *testing.T) {
	const secret = "test-proxy-secret-local-only"
	srv := newServer(t, serverConfig{ProxySecret: secret})

	direct := newClient(t, srv)
	direct.expect(http.StatusOK, "GET", "/healthz", nil) // exempt, for Render's health check
	direct.expect(http.StatusForbidden, "GET", "/api/me", nil)
	direct.header.Set("X-Proxy-Secret", "wrong")
	direct.expect(http.StatusForbidden, "GET", "/api/me", nil)

	proxied := newClient(t, srv)
	proxied.header.Set("X-Proxy-Secret", secret)
	proxied.expect(http.StatusUnauthorized, "GET", "/api/me", nil) // through the check, to auth

	// Behind the secret, the forwarded visitor address is what gets audited...
	proxied.header.Set("X-Client-IP", "203.0.113.9")
	ghost := uniqueEmail("proxied-ghost")
	proxied.expect(http.StatusUnauthorized, "POST", "/api/sessions", map[string]string{"email": ghost, "password": testPassword})
	if ip := auditIP(t, ghost, audit.ActionLoginFailed); ip != "203.0.113.9" {
		t.Errorf("proxied failed login recorded from %q, want 203.0.113.9", ip)
	}

	// ...but a value that is not an address falls back to the connection's.
	proxied.header.Set("X-Client-IP", "not-an-ip")
	ghost = uniqueEmail("garbage-ip")
	proxied.expect(http.StatusUnauthorized, "POST", "/api/sessions", map[string]string{"email": ghost, "password": testPassword})
	if ip := auditIP(t, ghost, audit.ActionLoginFailed); ip != "127.0.0.1" {
		t.Errorf("unparseable X-Client-IP recorded as %q, want 127.0.0.1", ip)
	}

	// Without a proxy secret configured, X-Client-IP is never trusted.
	open := newClient(t, newServer(t, serverConfig{}))
	open.header.Set("X-Client-IP", "198.51.100.7")
	ghost = uniqueEmail("spoofed")
	open.expect(http.StatusUnauthorized, "POST", "/api/sessions", map[string]string{"email": ghost, "password": testPassword})
	if ip := auditIP(t, ghost, audit.ActionLoginFailed); ip != "127.0.0.1" {
		t.Errorf("spoofed X-Client-IP was trusted: recorded %q", ip)
	}
}

func TestLoginRateLimit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	_, u := signUp(t, srv, "limited", "")
	c := newClient(t, srv)
	wrong := map[string]string{"email": u.Email, "password": "wrong-password-123"}
	right := map[string]string{"email": u.Email, "password": testPassword}

	// Correct logins never use up the limit.
	for i := 0; i < 12; i++ {
		c.expect(http.StatusOK, "POST", "/api/sessions", right)
	}
	for i := 0; i < 10; i++ {
		c.expect(http.StatusUnauthorized, "POST", "/api/sessions", wrong)
	}
	text := c.expect(http.StatusTooManyRequests, "POST", "/api/sessions", wrong)
	if retry := c.last.Header.Get("Retry-After"); retry == "" || retry == "0" {
		t.Errorf("429 without a usable Retry-After (%q): %s", retry, text)
	}
	// Refused before any password is checked: the right password is refused too.
	c.expect(http.StatusTooManyRequests, "POST", "/api/sessions", right)

	// A header the visitor controls does not buy a fresh count: without the
	// proxy secret configured, X-Client-IP is ignored.
	c.header.Set("X-Client-IP", "198.51.100.23")
	c.expect(http.StatusTooManyRequests, "POST", "/api/sessions", wrong)
}

func TestLoginRateLimitIsPerProxiedVisitor(t *testing.T) {
	const secret = "test-proxy-secret-local-only"
	srv := newServer(t, serverConfig{ProxySecret: secret})
	ghost := map[string]string{"email": uniqueEmail("nobody"), "password": testPassword}

	attacker := newClient(t, srv)
	attacker.header.Set("X-Proxy-Secret", secret)
	attacker.header.Set("X-Client-IP", "203.0.113.50")
	for i := 0; i < 10; i++ {
		attacker.expect(http.StatusUnauthorized, "POST", "/api/sessions", ghost)
	}
	attacker.expect(http.StatusTooManyRequests, "POST", "/api/sessions", ghost)

	// Behind the proxy, each visitor has their own count: everyone else
	// reaching the API through the same proxy is unaffected.
	bystander := newClient(t, srv)
	bystander.header.Set("X-Proxy-Secret", secret)
	bystander.header.Set("X-Client-IP", "203.0.113.51")
	bystander.expect(http.StatusUnauthorized, "POST", "/api/sessions", ghost)
}

func TestInviteAcceptRateLimit(t *testing.T) {
	c := newClient(t, newServer(t, serverConfig{}))
	// Malformed requests do not count...
	for i := 0; i < 8; i++ {
		c.expect(http.StatusBadRequest, "POST", "/api/invites/accept", `{"token":`)
	}
	// ...guessed tokens do, five per hour per visitor.
	guess := map[string]string{"token": strings.Repeat("cd", 32), "fullName": "G", "password": testPassword}
	for i := 0; i < 5; i++ {
		c.expect(http.StatusNotFound, "POST", "/api/invites/accept", guess)
	}
	c.expect(http.StatusTooManyRequests, "POST", "/api/invites/accept", guess)
}

func TestPruneOnLogin(t *testing.T) {
	requireDB(t)
	u := createAccount(t, "pruned", "")

	// An expired session, and invites in every state.
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := testDB.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')`, "prune-expired-1", u.ID)
	for hash, state := range map[string]string{
		"prune-used-8d":    `now() + interval '1 day', now() - interval '8 days'`, // used over a week ago: delete
		"prune-expired-8d": `now() - interval '8 days', NULL`,                     // expired over a week ago: delete
		"prune-used-1d":    `now() + interval '1 day', now() - interval '1 day'`,  // used recently: keep
		"prune-pending":    `now() + interval '1 day', NULL`,                      // still usable: keep
	} {
		exec(`INSERT INTO invites (token_hash, email, expires_at, used_at) VALUES ($1, $2, `+state+`)`, hash, uniqueEmail(hash))
	}
	count := func(query, arg string) int {
		t.Helper()
		var n int
		if err := testDB.QueryRow(query, arg).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	c := newClient(t, newServer(t, serverConfig{}))
	c.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": u.Email, "password": testPassword})

	if n := count(`SELECT count(*) FROM sessions WHERE token_hash = $1`, "prune-expired-1"); n != 0 {
		t.Error("the expired session survived a login")
	}
	c.expect(http.StatusOK, "GET", "/api/me", nil) // the live session it just created works
	for hash, want := range map[string]int{"prune-used-8d": 0, "prune-expired-8d": 0, "prune-used-1d": 1, "prune-pending": 1} {
		if n := count(`SELECT count(*) FROM invites WHERE token_hash = $1`, hash); n != want {
			t.Errorf("invite %s: %d rows after pruning, want %d", hash, n, want)
		}
	}

	// At most once an hour: the next login does not prune again.
	exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')`, "prune-expired-2", u.ID)
	c.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": u.Email, "password": testPassword})
	if n := count(`SELECT count(*) FROM sessions WHERE token_hash = $1`, "prune-expired-2"); n != 1 {
		t.Error("a second login within the hour pruned again")
	}
}

func TestAPIHealthzRequiresTheProxy(t *testing.T) {
	const secret = "test-proxy-secret-for-healthz"
	srv := newServer(t, serverConfig{ProxySecret: secret})

	direct := newClient(t, srv)
	direct.expect(http.StatusOK, "GET", "/healthz", nil)            // exempt, for Render
	direct.expect(http.StatusForbidden, "GET", "/api/healthz", nil) // not exempt

	proxied := newClient(t, srv)
	proxied.header.Set("X-Proxy-Secret", secret)
	if body := proxied.expect(http.StatusOK, "GET", "/api/healthz", nil); !strings.Contains(body, "ok") {
		t.Errorf("/api/healthz body = %q", body)
	}

	// It never touches the database: it answers even with the pool closed.
	closed, err := openDB("postgres://nobody:nothing@127.0.0.1:1/none?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	closed.Close()
	h := newHandler(closed, serverConfig{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("/api/healthz with no database answered %d, want 200", rec.Code)
	}
}
