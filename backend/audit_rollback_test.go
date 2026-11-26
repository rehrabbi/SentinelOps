package main

// Fault injection on the audit log: every state change and its audit entry
// commit together, so when the entry cannot be written the change must not
// happen either, and the request must fail with a 500.
//
// The fault is a test-only trigger, not a revoked grant: revoking INSERT would
// break every audit write in the shared test database, while the trigger fails
// only entries that match one (action, key) pair a test switches on, where key
// is the entry's actor_email or target_id.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"sentinelops/internal/audit"
	"sentinelops/internal/session"
)

var installAuditFault sync.Once

// failAudit makes every audit insert for action whose actor_email or
// target_id is key fail, until the returned function is called or the test
// ends. The trigger runs after the chain trigger (BEFORE triggers fire in name
// order), so the failing insert has already taken the chain lock, exactly as a
// real failure late in the insert would.
func failAudit(t *testing.T, action, key string) (stop func()) {
	t.Helper()
	requireDB(t)
	installAuditFault.Do(func() {
		for _, stmt := range []string{
			`CREATE TABLE test_audit_faults (action text NOT NULL, key text NOT NULL)`,
			`CREATE FUNCTION test_audit_fault() RETURNS trigger AS $$
			BEGIN
				IF EXISTS (SELECT 1 FROM test_audit_faults f
				           WHERE f.action = NEW.action
				             AND f.key IN (NEW.actor_email, coalesce(NEW.target_id, ''))) THEN
					RAISE EXCEPTION 'injected audit failure for %', NEW.action;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER zz_test_audit_fault BEFORE INSERT ON audit_log
			 FOR EACH ROW EXECUTE FUNCTION test_audit_fault()`,
		} {
			if _, err := testDB.Exec(stmt); err != nil {
				t.Fatalf("install audit fault: %v", err)
			}
		}
	})
	if _, err := testDB.Exec(`INSERT INTO test_audit_faults (action, key) VALUES ($1, $2)`, action, key); err != nil {
		t.Fatalf("switch on audit fault: %v", err)
	}
	var once sync.Once
	stop = func() {
		once.Do(func() {
			if _, err := testDB.Exec(`DELETE FROM test_audit_faults WHERE action = $1 AND key = $2`, action, key); err != nil {
				t.Errorf("switch off audit fault: %v", err)
			}
		})
	}
	t.Cleanup(stop)
	return stop
}

// countAudit counts audit entries for action whose actor_email or target_id is key.
func countAudit(t *testing.T, action, key string) int {
	t.Helper()
	var n int
	if err := testDB.QueryRow(`SELECT count(*) FROM audit_log WHERE action = $1 AND (actor_email = $2 OR target_id = $2)`,
		action, key).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// countSessions counts a user's sessions.
func countSessions(t *testing.T, userID string) int {
	t.Helper()
	var n int
	if err := testDB.QueryRow(`SELECT count(*) FROM sessions WHERE user_id = $1`, userID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// setsSessionCookie reports whether the last response set the session cookie
// to a value, as opposed to clearing it.
func setsSessionCookie(c *client) bool {
	for _, ck := range c.last.Cookies() {
		if ck.Name == "sentinelops_session" && ck.Value != "" {
			return true
		}
	}
	return false
}

// clearsSessionCookie reports whether the last response told the browser to drop the session cookie.
func clearsSessionCookie(c *client) bool {
	for _, ck := range c.last.Cookies() {
		if ck.Name == "sentinelops_session" && ck.MaxAge < 0 {
			return true
		}
	}
	return false
}

// A sign-in whose audit entry is lost creates no session and hands out no cookie.
func TestLoginRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	u := createAccount(t, "login-fault", "")
	c := newClient(t, srv)
	creds := map[string]string{"email": u.Email, "password": testPassword}

	stop := failAudit(t, audit.ActionLogin, u.Email)
	c.expect(http.StatusInternalServerError, "POST", "/api/sessions", creds)
	if setsSessionCookie(c) {
		t.Error("a sign-in that failed to commit still set a session cookie")
	}
	if n := countSessions(t, u.ID); n != 0 {
		t.Errorf("%d sessions exist after a sign-in whose audit failed, want 0", n)
	}
	c.expect(http.StatusUnauthorized, "GET", "/api/me", nil)

	stop()
	c.expect(http.StatusOK, "POST", "/api/sessions", creds)
	c.expect(http.StatusOK, "GET", "/api/me", nil)
	if n := countAudit(t, audit.ActionLogin, u.Email); n != 1 {
		t.Errorf("%d sign-in entries, want exactly the one that succeeded", n)
	}
}

// Failed sign-ins stay best effort: there is nothing to roll back, and the
// limiter counts only 401s, so a 500 here would let guesses go uncounted.
func TestFailedLoginAuditStaysBestEffort(t *testing.T) {
	srv := newServer(t, serverConfig{})
	u := createAccount(t, "failed-login-fault", "")
	c := newClient(t, srv)

	failAudit(t, audit.ActionLoginFailed, u.Email)
	c.expect(http.StatusUnauthorized, "POST", "/api/sessions",
		map[string]string{"email": u.Email, "password": "wrong-password-123"})
	if n := countAudit(t, audit.ActionLoginFailed, u.Email); n != 0 {
		t.Errorf("%d failed sign-in entries written through the fault, want 0", n)
	}
}

// A sign-out whose audit entry is lost keeps the session alive.
func TestLogoutRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	c, u := signUp(t, srv, "logout-fault", "")

	stop := failAudit(t, audit.ActionLogout, u.Email)
	c.expect(http.StatusInternalServerError, "DELETE", "/api/sessions/current", nil)
	if clearsSessionCookie(c) {
		t.Error("a sign-out that failed to commit still cleared the cookie")
	}
	if n := countSessions(t, u.ID); n != 1 {
		t.Errorf("%d sessions after a sign-out whose audit failed, want 1", n)
	}
	c.expect(http.StatusOK, "GET", "/api/me", nil)

	stop()
	c.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil)
	c.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	if n := countAudit(t, audit.ActionLogout, u.Email); n != 1 {
		t.Errorf("%d sign-out entries, want 1", n)
	}
}

var installLookupFault sync.Once

// failLookupAfterSessionDelete makes every statement that follows the deletion
// of one of userID's sessions, in the same transaction, unable to find its
// tables, until the returned function is called or the test ends. That is how
// a sign-out's user lookup fails after its DELETE has already succeeded: a
// SELECT cannot carry a trigger, so a test-only AFTER DELETE trigger on
// sessions empties the transaction's search_path instead. set_config with
// is_local true lasts until the transaction ends, so the rollback restores it
// and the pooled connection is left as it was.
func failLookupAfterSessionDelete(t *testing.T, userID string) (stop func()) {
	t.Helper()
	requireDB(t)
	installLookupFault.Do(func() {
		for _, stmt := range []string{
			`CREATE TABLE test_session_delete_faults (user_id uuid NOT NULL)`,
			`CREATE FUNCTION test_session_delete_fault() RETURNS trigger AS $$
			BEGIN
				IF EXISTS (SELECT 1 FROM test_session_delete_faults f WHERE f.user_id = OLD.user_id) THEN
					PERFORM set_config('search_path', 'pg_catalog', true);
				END IF;
				RETURN OLD;
			END;
			$$ LANGUAGE plpgsql`,
			`CREATE TRIGGER test_session_delete_fault AFTER DELETE ON sessions
			 FOR EACH ROW EXECUTE FUNCTION test_session_delete_fault()`,
		} {
			if _, err := testDB.Exec(stmt); err != nil {
				t.Fatalf("install lookup fault: %v", err)
			}
		}
	})
	if _, err := testDB.Exec(`INSERT INTO test_session_delete_faults (user_id) VALUES ($1)`, userID); err != nil {
		t.Fatalf("switch on lookup fault: %v", err)
	}
	var once sync.Once
	stop = func() {
		once.Do(func() {
			if _, err := testDB.Exec(`DELETE FROM test_session_delete_faults WHERE user_id = $1`, userID); err != nil {
				t.Errorf("switch off lookup fault: %v", err)
			}
		})
	}
	t.Cleanup(stop)
	return stop
}

// A sign-out whose user lookup fails after the session row is deleted rolls
// the deletion back: no session ends without its entry.
func TestLogoutRollsBackWhenLookupFails(t *testing.T) {
	srv := newServer(t, serverConfig{})
	c, u := signUp(t, srv, "logout-lookup-fault", "")

	stop := failLookupAfterSessionDelete(t, u.ID)
	c.expect(http.StatusInternalServerError, "DELETE", "/api/sessions/current", nil)
	if clearsSessionCookie(c) {
		t.Error("a sign-out that failed to commit still cleared the cookie")
	}
	if n := countSessions(t, u.ID); n != 1 {
		t.Errorf("%d sessions after a sign-out whose lookup failed, want 1", n)
	}
	if n := countAudit(t, audit.ActionLogout, u.Email); n != 0 {
		t.Errorf("%d sign-out entries after a failed sign-out, want 0", n)
	}
	c.expect(http.StatusOK, "GET", "/api/me", nil)

	stop()
	c.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil)
	c.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	if n := countAudit(t, audit.ActionLogout, u.Email); n != 1 {
		t.Errorf("%d sign-out entries, want 1", n)
	}
}

// clientWithSession returns a client whose browser holds rawToken as its
// session cookie, as a stale tab or a replayed cookie would.
func clientWithSession(t *testing.T, srv *httptest.Server, rawToken string) *client {
	t.Helper()
	c := newClient(t, srv)
	base, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	c.http.Jar.SetCookies(base, []*http.Cookie{{Name: "sentinelops_session", Value: rawToken, Path: "/"}})
	return c
}

// A cookie that matches no live session gets a clean 204 and an expired
// cookie, and writes no entry: nobody signed out.
func TestLogoutWithoutLiveSessionWritesNoEntry(t *testing.T) {
	srv := newServer(t, serverConfig{})
	c, u := signUp(t, srv, "logout-stale", "")
	base, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	var token string
	for _, ck := range c.http.Jar.Cookies(base) {
		if ck.Name == "sentinelops_session" {
			token = ck.Value
		}
	}
	if token == "" {
		t.Fatal("no session cookie after signing in")
	}

	c.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil)
	if n := countAudit(t, audit.ActionLogout, u.Email); n != 1 {
		t.Fatalf("%d sign-out entries after one sign-out, want 1", n)
	}

	// The same cookie again, as a second tab or a replay would send it: the
	// session is already gone, so there is no second entry.
	replay := clientWithSession(t, srv, token)
	replay.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil)
	if !clearsSessionCookie(replay) {
		t.Error("a sign-out with a dead cookie did not expire it")
	}

	// An expired session is not a live one either; its row is removed anyway.
	raw, hash, err := session.GenerateToken()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testDB.Exec(`INSERT INTO sessions (token_hash, user_id, expires_at)
	                          VALUES ($1, $2, now() - interval '1 hour')`, hash, u.ID); err != nil {
		t.Fatal(err)
	}
	expired := clientWithSession(t, srv, raw)
	expired.expect(http.StatusNoContent, "DELETE", "/api/sessions/current", nil)
	if !clearsSessionCookie(expired) {
		t.Error("a sign-out with an expired session did not expire the cookie")
	}
	if n := countSessions(t, u.ID); n != 0 {
		t.Errorf("%d sessions left, want the expired one removed too", n)
	}

	if n := countAudit(t, audit.ActionLogout, u.Email); n != 1 {
		t.Errorf("%d sign-out entries, want only the one real sign-out", n)
	}
}

// "Log out everywhere" whose audit entry is lost ends no session.
func TestLogoutEverywhereRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	here, u := signUp(t, srv, "logout-all-fault", "")
	elsewhere := newClient(t, srv)
	login(t, elsewhere, u.Email, testPassword)

	failAudit(t, audit.ActionLogoutAll, u.Email)
	here.expect(http.StatusInternalServerError, "DELETE", "/api/sessions", nil)
	if clearsSessionCookie(here) {
		t.Error("a log out everywhere that failed to commit still cleared the cookie")
	}
	if n := countSessions(t, u.ID); n != 2 {
		t.Errorf("%d sessions after a log out everywhere whose audit failed, want 2", n)
	}
	here.expect(http.StatusOK, "GET", "/api/me", nil)
	elsewhere.expect(http.StatusOK, "GET", "/api/me", nil)
}

// A password change whose audit entry is lost changes nothing.
func TestChangePasswordRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	here, u := signUp(t, srv, "change-fault", "")
	elsewhere := newClient(t, srv)
	login(t, elsewhere, u.Email, testPassword)

	failAudit(t, audit.ActionPasswordChanged, u.Email)
	here.expect(http.StatusInternalServerError, "PUT", "/api/me/password",
		map[string]string{"currentPassword": testPassword, "newPassword": newTestPassword})
	elsewhere.expect(http.StatusOK, "GET", "/api/me", nil)
	login(t, newClient(t, srv), u.Email, testPassword)
	newClient(t, srv).expect(http.StatusUnauthorized, "POST", "/api/sessions",
		map[string]string{"email": u.Email, "password": newTestPassword})
}

// An invite acceptance whose audit entry is lost creates no account and
// leaves the invite usable.
func TestInviteAcceptRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, _ := signUp(t, srv, "invite-fault-admin", "admin")
	email := uniqueEmail("invite-fault")
	var issued struct{ Token string }
	if err := json.Unmarshal([]byte(admin.expect(http.StatusCreated, "POST", "/api/invites",
		map[string]string{"email": email})), &issued); err != nil {
		t.Fatal(err)
	}
	body := map[string]string{"token": issued.Token, "fullName": "Invitee", "password": testPassword}
	invitee := newClient(t, srv)

	stop := failAudit(t, audit.ActionInviteAccepted, email)
	invitee.expect(http.StatusInternalServerError, "POST", "/api/invites/accept", body)
	var accounts, unused int
	testDB.QueryRow(`SELECT count(*) FROM users WHERE email = $1`, email).Scan(&accounts)
	testDB.QueryRow(`SELECT count(*) FROM invites WHERE token_hash = $1 AND used_at IS NULL`,
		session.HashToken(issued.Token)).Scan(&unused)
	if accounts != 0 || unused != 1 {
		t.Errorf("after a failed acceptance: %d accounts, %d unused invites; want 0 and 1", accounts, unused)
	}

	stop()
	invitee.expect(http.StatusCreated, "POST", "/api/invites/accept", body)
}

// Issuing a reset whose audit entry is lost stores no reset and leaves the
// earlier pending one working.
func TestIssueResetRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, adminUser := signUp(t, srv, "reset-fault-admin", "admin")
	target := createAccount(t, "reset-fault-target", "")
	path := "/api/users/" + target.ID + "/password-reset"
	var first struct{ Token string }
	if err := json.Unmarshal([]byte(admin.expect(http.StatusCreated, "POST", path, nil)), &first); err != nil {
		t.Fatal(err)
	}

	failAudit(t, audit.ActionPasswordResetIssued, adminUser.Email)
	admin.expect(http.StatusInternalServerError, "POST", path, nil)
	var pending int
	testDB.QueryRow(`SELECT count(*) FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, target.ID).Scan(&pending)
	if pending != 1 {
		t.Errorf("%d pending resets after a failed issue, want the earlier one only", pending)
	}
	newClient(t, srv).expect(http.StatusNoContent, "POST", "/api/password-resets/accept",
		map[string]string{"token": first.Token, "newPassword": newTestPassword})
}

// Using a reset whose audit entry is lost changes no password, ends no
// session, and leaves the link usable.
func TestAcceptResetRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, _ := signUp(t, srv, "use-reset-fault-admin", "admin")
	target, targetUser := signUp(t, srv, "use-reset-fault-target", "")
	var rs struct{ Token string }
	if err := json.Unmarshal([]byte(admin.expect(http.StatusCreated, "POST",
		"/api/users/"+targetUser.ID+"/password-reset", nil)), &rs); err != nil {
		t.Fatal(err)
	}
	body := map[string]string{"token": rs.Token, "newPassword": newTestPassword}
	public := newClient(t, srv)

	stop := failAudit(t, audit.ActionPasswordResetComplete, targetUser.Email)
	public.expect(http.StatusInternalServerError, "POST", "/api/password-resets/accept", body)
	target.expect(http.StatusOK, "GET", "/api/me", nil)
	login(t, newClient(t, srv), targetUser.Email, testPassword)

	stop()
	public.expect(http.StatusNoContent, "POST", "/api/password-resets/accept", body)
	target.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
}

// A role change whose audit entry is lost keeps the old role. This is the
// pattern the authentication events now follow.
func TestRoleChangeRollsBackWithoutAudit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, adminUser := signUp(t, srv, "role-fault-admin", "admin")
	reporter, reporterUser := signUp(t, srv, "role-fault-reporter", "")

	failAudit(t, audit.ActionRoleChanged, adminUser.Email)
	admin.expect(http.StatusInternalServerError, "PATCH", "/api/users/"+reporterUser.ID, map[string]string{"role": "admin"})
	if me := reporter.expect(http.StatusOK, "GET", "/api/me", nil); !strings.Contains(me, `"role":"reporter"`) {
		t.Errorf("role changed although its audit entry failed: %s", me)
	}
}

// The command-line subcommands use the same transactions: a lost entry means
// no invite and no reset link, and the command reports an error.
func TestCommandsRollBackWithoutAudit(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	var out bytes.Buffer

	email := uniqueEmail("cli-invite-fault")
	failAudit(t, audit.ActionInvited, email)
	if err := runInvite(ctx, testDB, []string{"--email", email}, &out); err == nil {
		t.Error("invite command succeeded although its audit entry failed")
	}
	var invites int
	testDB.QueryRow(`SELECT count(*) FROM invites WHERE email = $1`, email).Scan(&invites)
	if invites != 0 || strings.Contains(out.String(), "#") {
		t.Errorf("%d invites stored and output %q after a failed command, want none", invites, out.String())
	}

	u := createAccount(t, "cli-reset-fault", "")
	out.Reset()
	failAudit(t, audit.ActionPasswordResetIssued, u.ID)
	if err := runResetPassword(ctx, testDB, []string{"--email", u.Email}, &out); err == nil {
		t.Error("reset-password command succeeded although its audit entry failed")
	}
	var resets int
	testDB.QueryRow(`SELECT count(*) FROM password_resets WHERE user_id = $1`, u.ID).Scan(&resets)
	if resets != 0 || strings.Contains(out.String(), "#") {
		t.Errorf("%d resets stored and output %q after a failed command, want none", resets, out.String())
	}
}
