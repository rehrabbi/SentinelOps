// Package auth implements authentication behavior: logging in (creating a
// session), logging out, and (soon) the middleware that protects routes.
package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sentinelops/internal/audit"
	"sentinelops/internal/authctx"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

const (
	// cookieName is the name of the session cookie in the browser.
	cookieName = "sentinelops_session"
	// sessionTTL is how long a login session stays valid (our 7-day decision).
	sessionTTL = 7 * 24 * time.Hour
)

// dummyHash is a precomputed bcrypt hash used ONLY to equalize response timing
// when a login targets an email that doesn't exist. Running a real bcrypt
// comparison in that case makes "no such user" take about as long as "wrong
// password", so an attacker can't use response time to discover which emails
// are registered.
var dummyHash []byte

// init runs once when the package loads, precomputing the dummy hash.
func init() {
	h, err := bcrypt.GenerateFromPassword([]byte("timing-equalizer-not-a-real-password"), bcrypt.DefaultCost)
	if err != nil {
		panic("auth: cannot precompute dummy hash: " + err.Error())
	}
	dummyHash = h
}

type Handler struct {
	db            *sql.DB
	users         *user.Repository
	sessions      *session.Repository
	audit         *audit.Repository
	secureCookies bool
}

// NewHandler builds an auth Handler. It takes the pool itself because a
// sign-in and a sign-out each commit their session change and its audit entry
// in one transaction. secureCookies controls the cookie's Secure flag: false
// for local http development, true in production over HTTPS.
func NewHandler(db *sql.DB, users *user.Repository, sessions *session.Repository, auditLog *audit.Repository, secureCookies bool) *Handler {
	return &Handler{db: db, users: users, sessions: sessions, audit: auditLog, secureCookies: secureCookies}
}

// recordFailedLogin writes the entry for a failed sign-in, logging rather than
// failing when it cannot. This is the one authentication event that stays best
// effort, on purpose:
//   - nothing changed, so there is nothing to roll back;
//   - the login limiter counts only 401 responses, so turning a lost entry
//     into a 500 would let password guesses go uncounted while the audit log
//     is failing, which is exactly when nobody is watching;
//   - the response must stay the same 401 whatever the reason, so it cannot
//     carry the audit outcome anyway.
//
// Every sign-in that succeeds, and every sign-out, commits with its entry or
// not at all (see Login and Logout).
func (h *Handler) recordFailedLogin(ctx context.Context, e audit.Entry) {
	if err := h.audit.Record(ctx, e); err != nil {
		log.Printf("audit: %v", err)
	}
}

// loginInput is the request body for POST /api/sessions.
type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login handles POST /api/sessions: verify credentials, then create a session.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	// Same input hardening as registration: cap the body, parse strictly.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var in loginInput
	if err := dec.Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	in.Email = strings.TrimSpace(in.Email)

	ip := audit.ClientIP(r)

	// 1) Find the user. A missing user must fail the SAME way as a wrong
	// password: generic message, same 401, similar timing.
	u, err := h.users.GetByEmail(r.Context(), in.Email)
	if err != nil {
		if errors.Is(err, user.ErrUserNotFound) {
			// The response hides which of the two failed; the audit entry does
			// not, because an investigator needs the difference. This is why
			// the audit log is more sensitive than the API surface.
			h.recordFailedLogin(r.Context(), audit.Entry{
				ActorEmail: in.Email,
				Action:     audit.ActionLoginFailed,
				Outcome:    audit.OutcomeFailure,
				Detail:     map[string]any{"reason": "unknown_email"},
				IP:         ip,
			})
			// Equalize timing with a throwaway bcrypt compare, then fail generically.
			bcrypt.CompareHashAndPassword(dummyHash, []byte(in.Password))
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}
		log.Printf("login: get user: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// 2) Verify the password against the stored bcrypt hash.
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)); err != nil {
		// Here we DO know who it was, so the entry names them. A run of these
		// against one account is what a brute force attempt looks like.
		h.recordFailedLogin(r.Context(), audit.Entry{
			ActorID:    &u.ID,
			ActorEmail: u.Email,
			Action:     audit.ActionLoginFailed,
			Outcome:    audit.OutcomeFailure,
			Detail:     map[string]any{"reason": "bad_password"},
			IP:         ip,
		})
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	// 3) Credentials valid — mint a session token and store only its hash.
	rawToken, tokenHash, err := session.GenerateToken()
	if err != nil {
		log.Printf("login: generate token: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	expiresAt := time.Now().Add(sessionTTL)

	// The session and its audit entry share one transaction, like a role
	// change: a sign-in nobody can account for must not happen. The password
	// check above stays outside it, so no transaction is open during bcrypt.
	// The audit insert comes last, right before the commit, because the chain
	// trigger takes a lock that every audit write waits on until this commits;
	// ordering it last means the lock covers only the insert and the commit,
	// the same window a role change holds it for, never the session insert.
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		log.Printf("login: begin: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback() // no-op after Commit

	if _, err := h.sessions.Create(r.Context(), tx, tokenHash, u.ID, expiresAt); err != nil {
		log.Printf("login: create session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if err := h.audit.RecordTx(r.Context(), tx, audit.Entry{
		ActorID:    &u.ID,
		ActorEmail: u.Email,
		Action:     audit.ActionLogin,
		Outcome:    audit.OutcomeSuccess,
		IP:         ip,
	}); err != nil {
		log.Printf("login: audit: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		log.Printf("login: commit: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// 4) Send the RAW token to the browser in a hardened cookie, only now that
	// the session is committed: a rolled-back sign-in never hands one out. The
	// database holds only its hash, so this cookie is the only copy of the secret.
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    rawToken,
		Path:     "/",
		HttpOnly: true,                 // JS cannot read it -> XSS can't steal it
		Secure:   h.secureCookies,      // HTTPS-only in production
		SameSite: http.SameSiteLaxMode, // not sent on cross-site sub-requests -> CSRF defense
		Expires:  expiresAt,
		MaxAge:   int(sessionTTL.Seconds()),
	})

	// 5) Respond with the logged-in user. PasswordHash was loaded for step 2,
	// but its json:"-" tag guarantees it is never serialized here.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("login: encode response: %v", err)
	}
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	p, ok := authctx.FromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// The context carries only the caller's id and role, so load the full row
	// to answer with. One extra query, and the response reflects the database
	// at response time rather than at middleware time.
	u, err := h.users.GetByID(r.Context(), h.db, p.ID)
	if err != nil {
		if errors.Is(err, user.ErrUserNotFound) {
			http.Error(w, "authentication required", http.StatusUnauthorized)
			return
		}
		log.Printf("me: get user: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("me: encode response: %v", err)
	}
}

// Logout handles DELETE /api/sessions/current: revoke the current session and
// clear the cookie. It is public and idempotent — a missing cookie, or one
// that matches no live session, still yields a clean 204 with the cookie
// expired and no audit entry, since no sign-out happened. Any other failure
// (a lookup error, a lost audit entry, a failed commit) answers 500, and then
// the session and the cookie both stay, so the browser's state matches the
// database's.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	// If a session cookie is present, delete its row so the token is truly
	// revoked server-side — not merely forgotten by the browser.
	if c, err := r.Cookie(cookieName); err == nil {
		tokenHash := session.HashToken(c.Value)

		// The deletion, the lookup of whose session it was, and the audit
		// entry share one transaction, like a role change: if any of them
		// fails, the session is not ended and the request fails. The order
		// keeps the lock order of every other audited change: the session's
		// row lock first, the audit insert (and the chain lock it takes) last,
		// right before the commit.
		tx, err := h.db.BeginTx(r.Context(), nil)
		if err != nil {
			log.Printf("logout: begin: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback() // no-op after Commit

		// The owner comes back from the DELETE itself, so only the request
		// that actually ended the session names them: a second sign-out with
		// the same cookie finds nothing and writes no second entry.
		userID, err := h.sessions.DeleteByTokenHash(r.Context(), tx, tokenHash)
		switch {
		case errors.Is(err, session.ErrSessionNotFound):
			// No live session behind this cookie: nobody signed out, so
			// there is nothing to record.
		case err != nil:
			log.Printf("logout: delete session: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		default:
			// Any error here, not-found included, fails the sign-out: a
			// session was ended, so it must not commit without its entry.
			actor, err := h.users.GetByID(r.Context(), tx, userID)
			if err != nil {
				log.Printf("logout: get user: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
			if err := h.audit.RecordTx(r.Context(), tx, audit.Entry{
				ActorID:    &actor.ID,
				ActorEmail: actor.Email,
				Action:     audit.ActionLogout,
				Outcome:    audit.OutcomeSuccess,
				IP:         audit.ClientIP(r),
			}); err != nil {
				log.Printf("logout: audit: %v", err)
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}
		}

		if err := tx.Commit(); err != nil {
			log.Printf("logout: commit: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
	}

	ExpireCookie(w, h.secureCookies)
	w.WriteHeader(http.StatusNoContent)
}

// ExpireCookie overwrites the session cookie with an expired one so the
// browser drops it. Name and Path must match the login cookie or the browser
// won't replace it. Used by logout and by "log out everywhere".
func ExpireCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1, // negative MaxAge tells the browser to delete it immediately
	})
}

// CurrentTokenHash returns the hash of the session token the request carries,
// so a password change can keep that one session while ending the others.
func CurrentTokenHash(r *http.Request) (string, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return "", false
	}
	return session.HashToken(c.Value), true
}
