package main

// Integration tests for account security: changing a password, logging out
// everywhere, and admin-issued password resets (internal/account).

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"sentinelops/internal/audit"
	"sentinelops/internal/session"
)

const newTestPassword = "staple-battery-horse-correct" // local-only test value

// login logs client c in as email with password.
func login(t *testing.T, c *client, email, password string) {
	t.Helper()
	c.expect(http.StatusOK, "POST", "/api/sessions", map[string]string{"email": email, "password": password})
}

// auditDetail returns one detail field of the newest audit entry for an actor.
func auditDetail(t *testing.T, actorEmail, action, outcome, key string) string {
	t.Helper()
	var v string
	err := testDB.QueryRow(`SELECT coalesce(detail->>$4, '') FROM audit_log
	                        WHERE actor_email = $1 AND action = $2 AND outcome = $3
	                        ORDER BY id DESC LIMIT 1`, actorEmail, action, outcome, key).Scan(&v)
	if err != nil {
		t.Fatalf("audit entry %s/%s for %s: %v", action, outcome, actorEmail, err)
	}
	return v
}

func TestChangePassword(t *testing.T) {
	srv := newServer(t, serverConfig{})
	here, u := signUp(t, srv, "changer", "")
	elsewhere := newClient(t, srv)
	login(t, elsewhere, u.Email, testPassword)

	newClient(t, srv).expect(http.StatusUnauthorized, "PUT", "/api/me/password",
		map[string]string{"currentPassword": testPassword, "newPassword": newTestPassword})

	// A wrong current password is refused and recorded, whatever the new one is.
	here.expect(http.StatusForbidden, "PUT", "/api/me/password",
		map[string]string{"currentPassword": "wrong-password-123", "newPassword": "short"})
	if got := auditDetail(t, u.Email, audit.ActionPasswordChanged, audit.OutcomeFailure, "reason"); got != "bad_password" {
		t.Errorf("failed change recorded with reason %q", got)
	}
	// The same rules as accepting an invite, and a change must change something.
	here.expect(http.StatusBadRequest, "PUT", "/api/me/password",
		map[string]string{"currentPassword": testPassword, "newPassword": "too-short"})
	here.expect(http.StatusBadRequest, "PUT", "/api/me/password",
		map[string]string{"currentPassword": testPassword, "newPassword": testPassword})
	here.expect(http.StatusBadRequest, "PUT", "/api/me/password",
		`{"currentPassword":"x","newPassword":"y","role":"admin"}`)

	here.expect(http.StatusNoContent, "PUT", "/api/me/password",
		map[string]string{"currentPassword": testPassword, "newPassword": newTestPassword})

	// This session survives; the other device is logged out.
	here.expect(http.StatusOK, "GET", "/api/me", nil)
	elsewhere.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	if got := auditDetail(t, u.Email, audit.ActionPasswordChanged, audit.OutcomeSuccess, "sessions_ended"); got != "1" {
		t.Errorf("change recorded %s sessions ended, want 1", got)
	}

	// Only the new password works now.
	c := newClient(t, srv)
	c.expect(http.StatusUnauthorized, "POST", "/api/sessions", map[string]string{"email": u.Email, "password": testPassword})
	login(t, c, u.Email, newTestPassword)
}

func TestChangePasswordRateLimit(t *testing.T) {
	srv := newServer(t, serverConfig{})
	c, _ := signUp(t, srv, "change-limited", "")
	wrong := map[string]string{"currentPassword": "wrong-password-123", "newPassword": newTestPassword}

	// Rule-breaking new passwords do not count; wrong current passwords do.
	for i := 0; i < 12; i++ {
		c.expect(http.StatusBadRequest, "PUT", "/api/me/password",
			map[string]string{"currentPassword": testPassword, "newPassword": "short"})
	}
	for i := 0; i < 10; i++ {
		c.expect(http.StatusForbidden, "PUT", "/api/me/password", wrong)
	}
	c.expect(http.StatusTooManyRequests, "PUT", "/api/me/password", wrong)
	// Refused before any password is checked: the right one is refused too.
	c.expect(http.StatusTooManyRequests, "PUT", "/api/me/password",
		map[string]string{"currentPassword": testPassword, "newPassword": newTestPassword})
}

func TestLogoutEverywhere(t *testing.T) {
	srv := newServer(t, serverConfig{})
	here, u := signUp(t, srv, "everywhere", "")
	elsewhere := newClient(t, srv)
	login(t, elsewhere, u.Email, testPassword)
	_, bystander := signUp(t, srv, "bystander", "")

	newClient(t, srv).expect(http.StatusUnauthorized, "DELETE", "/api/sessions", nil)

	here.expect(http.StatusNoContent, "DELETE", "/api/sessions", nil)
	cleared := false
	for _, ck := range here.last.Cookies() {
		if ck.Name == "sentinelops_session" && ck.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Error("log out everywhere did not clear the cookie")
	}
	here.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	elsewhere.expect(http.StatusUnauthorized, "GET", "/api/me", nil)

	var left int
	if err := testDB.QueryRow(`SELECT count(*) FROM sessions WHERE user_id = $1`, u.ID).Scan(&left); err != nil || left != 0 {
		t.Errorf("%d sessions left after log out everywhere (%v)", left, err)
	}
	if got := auditDetail(t, u.Email, audit.ActionLogoutAll, audit.OutcomeSuccess, "sessions_ended"); got != "2" {
		t.Errorf("recorded %s sessions ended, want 2", got)
	}
	// Other people's sessions are untouched.
	var others int
	if err := testDB.QueryRow(`SELECT count(*) FROM sessions WHERE user_id = $1`, bystander.ID).Scan(&others); err != nil || others != 1 {
		t.Errorf("bystander has %d sessions (%v), want 1", others, err)
	}
}

type issuedResetBody struct {
	Token     string `json:"token"`
	Email     string `json:"email"`
	ExpiresAt string `json:"expiresAt"`
}

func TestPasswordReset(t *testing.T) {
	srv := newServer(t, serverConfig{})
	admin, adminUser := signUp(t, srv, "reset-admin", "admin")
	target, targetUser := signUp(t, srv, "forgetful", "")
	targetElsewhere := newClient(t, srv)
	login(t, targetElsewhere, targetUser.Email, testPassword)
	path := "/api/users/" + targetUser.ID + "/password-reset"

	issue := func(p string) issuedResetBody {
		t.Helper()
		var body issuedResetBody
		if err := json.Unmarshal([]byte(admin.expect(http.StatusCreated, "POST", p, nil)), &body); err != nil {
			t.Fatal(err)
		}
		if cc := admin.last.Header.Get("Cache-Control"); cc != "no-store" {
			t.Errorf("reset response Cache-Control = %q, want no-store", cc)
		}
		return body
	}

	// Who may issue one, and for whom. A non-admin is refused even for someone
	// else's account, which the own-account rule alone would not refuse.
	target.expect(http.StatusForbidden, "POST", "/api/users/"+adminUser.ID+"/password-reset", nil)
	newClient(t, srv).expect(http.StatusUnauthorized, "POST", path, nil)
	admin.expect(http.StatusForbidden, "POST", "/api/users/"+adminUser.ID+"/password-reset", nil)
	admin.expect(http.StatusNotFound, "POST", "/api/users/00000000-0000-0000-0000-000000000000/password-reset", nil)
	admin.expect(http.StatusNotFound, "POST", "/api/users/not-a-uuid/password-reset", nil)

	first := issue(path)
	second := issue(path)
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(second.Token) || second.Email != targetUser.Email {
		t.Fatalf("issued %+v", second)
	}
	// Only its hash is stored.
	var stored int
	if err := testDB.QueryRow(`SELECT count(*) FROM password_resets WHERE token_hash IN ($1, $2)`,
		second.Token, session.HashToken(second.Token)).Scan(&stored); err != nil || stored != 1 {
		t.Errorf("stored %d rows for the token and its hash (%v), want only the hash", stored, err)
	}
	if got := auditDetail(t, adminUser.Email, audit.ActionPasswordResetIssued, audit.OutcomeSuccess, "email"); got != targetUser.Email {
		t.Errorf("issue recorded for %q", got)
	}

	public := newClient(t, srv)
	accept := func(want int, token, password string) {
		t.Helper()
		public.expect(want, "POST", "/api/password-resets/accept", map[string]string{"token": token, "newPassword": password})
	}
	// A newer reset retires the older one.
	accept(http.StatusNotFound, first.Token, newTestPassword)
	// A rule-breaking password leaves the link usable.
	accept(http.StatusBadRequest, second.Token, "short")
	accept(http.StatusNoContent, second.Token, newTestPassword)
	accept(http.StatusNotFound, second.Token, newTestPassword+"-again") // one use only

	// Every session of the account ended, and only the new password works.
	target.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	targetElsewhere.expect(http.StatusUnauthorized, "GET", "/api/me", nil)
	public.expect(http.StatusUnauthorized, "POST", "/api/sessions", map[string]string{"email": targetUser.Email, "password": testPassword})
	login(t, newClient(t, srv), targetUser.Email, newTestPassword)
	if got := auditDetail(t, targetUser.Email, audit.ActionPasswordResetComplete, audit.OutcomeSuccess, "sessions_ended"); got != "2" {
		t.Errorf("reset recorded %s sessions ended, want 2", got)
	}

	// An expired link does not work.
	stale := issue(path)
	if _, err := testDB.Exec(`UPDATE password_resets SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
		session.HashToken(stale.Token)); err != nil {
		t.Fatal(err)
	}
	accept(http.StatusNotFound, stale.Token, newTestPassword+"-stale")

	// Other admins can be reset too: any account but your own.
	_, otherAdmin := signUp(t, srv, "other-admin", "admin")
	other := issue("/api/users/" + otherAdmin.ID + "/password-reset")
	accept(http.StatusNoContent, other.Token, newTestPassword)
	login(t, newClient(t, srv), otherAdmin.Email, newTestPassword)
}

func TestPasswordResetAcceptRateLimit(t *testing.T) {
	c := newClient(t, newServer(t, serverConfig{}))
	// Malformed requests and rule-breaking passwords do not count...
	for i := 0; i < 6; i++ {
		c.expect(http.StatusBadRequest, "POST", "/api/password-resets/accept", `{"token":`)
		c.expect(http.StatusBadRequest, "POST", "/api/password-resets/accept",
			map[string]string{"token": strings.Repeat("ef", 32), "newPassword": "short"})
	}
	// ...guessed tokens do, ten per hour per visitor.
	guess := map[string]string{"token": strings.Repeat("ef", 32), "newPassword": newTestPassword}
	for i := 0; i < 10; i++ {
		c.expect(http.StatusNotFound, "POST", "/api/password-resets/accept", guess)
	}
	c.expect(http.StatusTooManyRequests, "POST", "/api/password-resets/accept", guess)
}
