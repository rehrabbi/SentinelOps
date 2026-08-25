package auth

import (
	"context"
	"errors"
	"log"
	"net/http"

	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

// contextKey is a private type for the context keys this package sets. Using an
// unexported named type (not a bare string) makes collisions impossible: another
// package could use the string "user" as a key, but it cannot name auth.contextKey.
// go vet flags bare-string context keys for exactly this reason.
type contextKey int

// userContextKey identifies the authenticated user stored in the request context.
const userContextKey contextKey = 0

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

		// 4) Attach the user to the request context and proceed. Handlers behind
		// this middleware can now pull the user out with UserFromContext.
		ctx := context.WithValue(r.Context(), userContextKey, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserFromContext returns the authenticated user that RequireAuth stored. The
// bool is false when there is no user (i.e. the handler was not placed behind
// RequireAuth) — callers must check it instead of assuming a user is present.
func UserFromContext(ctx context.Context) (user.User, bool) {
	u, ok := ctx.Value(userContextKey).(user.User)
	return u, ok
}
