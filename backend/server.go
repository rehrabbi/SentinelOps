package main

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"sentinelops/internal/account"
	"sentinelops/internal/audit"
	"sentinelops/internal/auth"
	"sentinelops/internal/incident"
	"sentinelops/internal/invite"
	"sentinelops/internal/prune"
	"sentinelops/internal/ratelimit"
	"sentinelops/internal/reqlog"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

// serverConfig is the environment-derived configuration the HTTP API needs.
// main reads it from the environment; tests set it directly.
type serverConfig struct {
	FrontendOrigin string // the one origin CORS allows, with credentials
	SecureCookies  bool   // set the session cookie's Secure flag (true in production)
	ProxySecret    string // required in X-Proxy-Secret; empty switches the check off
	// ProxySecretPrevious is also accepted, only while PROXY_SECRET is being
	// rotated; empty (the normal state) accepts the current secret alone.
	ProxySecretPrevious string
	Logger              *slog.Logger // where request logs go; nil means slog.Default()
}

// newHandler builds the whole HTTP API: every route, its middleware, and the
// repositories behind them. main serves it; the integration tests serve the
// very same handler through httptest, so they exercise the real wiring.
func newHandler(db *sql.DB, cfg serverConfig) http.Handler {
	// A ServeMux ("multiplexer" / router) inspects each incoming
	// request and decides which handler function should answer it.
	mux := http.NewServeMux()

	// Liveness — "is the process up?" Does NOT touch the database.
	mux.HandleFunc("GET /healthz", healthHandler)

	// The same liveness answer, but under /api, where the site's proxy forwards
	// and the proxy secret is required (only /healthz itself is exempt). Uptime
	// monitoring fetches it through the site, so one check covers the whole
	// path a user's request takes: Cloudflare, the proxy function, the shared
	// secret, Render, and the API. It never touches the database, so checking
	// it every few minutes does not keep the database awake.
	mux.HandleFunc("GET /api/healthz", healthHandler)

	// Readiness — "can we serve real traffic?" Pings the database.
	mux.HandleFunc("GET /readyz", readyHandler(db))

	// Users feature: wire the repository (SQL) to the handler (HTTP), then
	// register its routes. This is dependency injection by hand — main() is
	// where all the pieces are constructed and connected.
	// The audit repository is built first because several handlers record to it.
	auditRepo := audit.NewRepository(db)

	// The user handler also takes the pool itself, because changing a role runs
	// the update and its audit entry inside one transaction.
	userRepo := user.NewRepository(db)
	userHandler := user.NewHandler(userRepo, db, auditRepo)
	// GET /api/users is registered further down: it is admin-only, so it needs
	// authHandler, which does not exist yet at this point.
	// There is no open sign-up (see internal/invite): accounts come only from
	// invites. Accepting one is public, because the invitee has no account
	// yet, and limited per visitor to 5 an hour, counting accounts created
	// (201), taken addresses (409) and unusable tokens (404); a mistyped name
	// or a too-short password (400) does not count.
	inviteHandler := invite.NewHandler(db, userRepo, auditRepo)
	signupLimit := ratelimit.New(5, time.Hour)
	mux.Handle("POST /api/invites/accept", signupLimit.Wrap(http.HandlerFunc(inviteHandler.Accept), visitorKey,
		func(status int) bool {
			return status == http.StatusCreated || status == http.StatusConflict || status == http.StatusNotFound
		}))

	// Auth feature: login reads a user AND writes a session, so it takes both
	// repositories. This is why auth is its own package rather than living
	// inside user or session.
	sessionRepo := session.NewRepository(db)
	authHandler := auth.NewHandler(userRepo, sessionRepo, auditRepo, cfg.SecureCookies)
	// Login is limited per visitor: after 10 failed logins in 15 minutes every
	// further attempt gets 429 before any password is checked. Only failures
	// count, so a correct password never uses up the limit, and a success does
	// not reset it, so an attacker cannot clear their count by logging in to
	// an account of their own between guesses.
	//
	// A successful login also triggers the cleanup of expired sessions and
	// spent invites and password resets, at most once an hour (see internal/prune).
	loginLimit := ratelimit.New(10, 15*time.Minute)
	pruner := prune.New(db, time.Hour)
	mux.Handle("POST /api/sessions", loginLimit.Wrap(pruner.AfterLogin(http.HandlerFunc(authHandler.Login)), visitorKey,
		func(status int) bool { return status == http.StatusUnauthorized }))

	// Protected route: GET /api/me returns the current user. RequireAuth wraps
	// the Me handler, so an invalid/missing session is rejected with 401 before
	// Me runs. This is our first route that requires authentication.
	mux.Handle("GET /api/me", authHandler.RequireAuth(http.HandlerFunc(authHandler.Me)))

	// Listing users exposes every account's email, name, and role, so it is
	// admin-only rather than merely authenticated. RequireRole is chained INSIDE
	// RequireAuth, because RequireAuth is what loads the user it reads.
	mux.Handle("GET /api/users",
		authHandler.RequireAuth(authHandler.RequireRole("admin", http.HandlerFunc(userHandler.List))))

	// Changing a role is admin-only too. The handler additionally refuses an
	// admin changing their OWN role, which keeps at least one admin alive.
	mux.Handle("PATCH /api/users/{id}",
		authHandler.RequireAuth(authHandler.RequireRole("admin", http.HandlerFunc(userHandler.UpdateRole))))

	// Issuing an invite is admin-only: it decides who gets an account, and
	// with which role.
	mux.Handle("POST /api/invites",
		authHandler.RequireAuth(authHandler.RequireRole("admin", http.HandlerFunc(inviteHandler.Create))))

	// Logout: destroy the current session and clear the cookie. Public and
	// idempotent (see auth.Logout), so it is NOT wrapped in RequireAuth.
	mux.HandleFunc("DELETE /api/sessions/current", authHandler.Logout)

	// Account security (see internal/account). Changing a password needs the
	// current one, so it is limited like login: 10 wrong current passwords
	// (403) per visitor in 15 minutes, on a limiter of its own. Logging out
	// everywhere ends every session of the caller, this one included.
	accountHandler := account.NewHandler(account.NewService(db, userRepo, auditRepo), cfg.SecureCookies)
	changeLimit := ratelimit.New(10, 15*time.Minute)
	mux.Handle("PUT /api/me/password", changeLimit.Wrap(
		authHandler.RequireAuth(http.HandlerFunc(accountHandler.ChangePassword)), visitorKey,
		func(status int) bool { return status == http.StatusForbidden }))
	mux.Handle("DELETE /api/sessions", authHandler.RequireAuth(http.HandlerFunc(accountHandler.LogoutEverywhere)))

	// An admin issues a one-time reset link for any other account, admins
	// included; using it is public, because its owner cannot log in. Using
	// one is limited per visitor to 10 an hour, counting successes (204) and
	// unusable tokens (404); a too-short password (400) does not count.
	mux.Handle("POST /api/users/{id}/password-reset",
		authHandler.RequireAuth(authHandler.RequireRole("admin", http.HandlerFunc(accountHandler.IssueReset))))
	resetLimit := ratelimit.New(10, time.Hour)
	mux.Handle("POST /api/password-resets/accept", resetLimit.Wrap(http.HandlerFunc(accountHandler.AcceptReset), visitorKey,
		func(status int) bool { return status == http.StatusNoContent || status == http.StatusNotFound }))

	// Incidents feature: create + list, BOTH behind RequireAuth. The handler
	// reads the authenticated user from the request context (for ownership on
	// create, and role-based scoping on list), so these must be wrapped.
	incidentRepo := incident.NewRepository(db)
	incidentHandler := incident.NewHandler(incidentRepo)
	mux.Handle("POST /api/incidents", authHandler.RequireAuth(http.HandlerFunc(incidentHandler.Create)))
	mux.Handle("GET /api/incidents", authHandler.RequireAuth(http.HandlerFunc(incidentHandler.List)))
	mux.Handle("GET /api/incidents/{id}",
		authHandler.RequireAuth(http.HandlerFunc(incidentHandler.Get)))
	mux.Handle("PATCH /api/incidents/{id}",
		authHandler.RequireAuth(http.HandlerFunc(incidentHandler.Update)))

	// Wrap the router in CORS middleware so our browser frontend (and only
	// that origin) is allowed to read API responses, and wrap that in the
	// proxy check, so nothing at all is answered without the proxy's secret.
	// Outermost, one JSON log line per request, including requests the proxy
	// check refuses. Until the proxy check has decided whether to trust the
	// forwarded address, the visitor is the connection's own; once it has, the
	// layer inside it records the real visitor key, the same one the rate
	// limiter uses.
	inner := withCORS(mux, cfg.FrontendOrigin)
	noteVisitor := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqlog.SetVisitor(r.Context(), visitorKey(r))
		inner.ServeHTTP(w, r)
	})
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return reqlog.Middleware(logger, visitorKey, requireProxySecret(noteVisitor, cfg.ProxySecret, cfg.ProxySecretPrevious))
}

// visitorKey identifies the visitor for rate limiting: the address the proxy
// reported, trusted only behind the proxy secret, otherwise the connection's
// own (see audit.ClientIP). Never a header the visitor controls.
func visitorKey(r *http.Request) string {
	ip := audit.ClientIP(r)
	if ip == nil {
		return "unknown"
	}
	return ratelimit.Key(*ip)
}
