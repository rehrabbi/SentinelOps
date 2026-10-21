package auth

import (
	"errors"
	"log"
	"net/http"

	"sentinelops/internal/authctx"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

// RequireAuth is middleware that gates next behind a valid session. It reads the
// session cookie, verifies it maps to a live session, loads that user, attaches
// the user to the request context, then calls next. Every failure short-circuits
// with a generic 401 — next runs ONLY on the success path.
func (h *Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1) No session cookie at all -> not authenticated.
		c, err := r.Cookie(cookieName)
		if err != nil {
			http.Error(w, "authentication required", http.StatusUnauthorized)
			return
		}

		// 2) Hash the raw token and look up a non-expired session. Missing OR
		// expired both surface as ErrSessionNotFound -> the same 401.
		tokenHash := session.HashToken(c.Value)
		sess, err := h.sessions.GetByTokenHash(r.Context(), tokenHash)
		if err != nil {
			if errors.Is(err, session.ErrSessionNotFound) {
				http.Error(w, "authentication required", http.StatusUnauthorized)
				return
			}
			log.Printf("auth: get session: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		// 3) Load the user this session belongs to.
		u, err := h.users.GetByID(r.Context(), sess.UserID)
		if err != nil {
			if errors.Is(err, user.ErrUserNotFound) {
				http.Error(w, "authentication required", http.StatusUnauthorized)
				return
			}
			log.Printf("auth: get user: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		// 4) Attach the caller to the request context and proceed. Handlers behind
		// this middleware pull it out with authctx.FromContext. Only the id and
		// role travel: a context states who is asking, it is not a row cache.
		ctx := authctx.WithPrincipal(r.Context(), authctx.Principal{ID: u.ID, Role: u.Role})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole is middleware that gates next behind a role. It must be chained
// INSIDE RequireAuth, which is what puts the user in the context; on its own it
// fails closed with a 401 rather than letting the request through.
//
// Authentication answers "who are you", authorization answers "may you do this".
// RequireAuth only does the first, so a route that is merely authenticated is
// open to every registered account.
//
// A caller who is authenticated but lacks the role gets 403, not 404: unlike an
// incident, the existence of this route is not a secret, and hiding the reason
// here would only make the API harder to debug without protecting anything.
func (h *Handler) RequireRole(role string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := authctx.FromContext(r.Context())
		if !ok {
			// No user in context means this was not placed behind RequireAuth.
			// Fail closed rather than trusting the wiring.
			http.Error(w, "authentication required", http.StatusUnauthorized)
			return
		}

		// The role comes from the user row loaded this request, never from the
		// client, so it cannot be forged and a revoked role takes effect at once.
		if p.Role != role {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
