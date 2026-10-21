// Package auth implements authentication behavior: logging in (creating a
// session), logging out, and (soon) the middleware that protects routes.
package auth

import (
	"context"
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
	users         *user.Repository
	sessions      *session.Repository
	audit         *audit.Repository
	secureCookies bool
}

// NewHandler builds an auth Handler. secureCookies controls the cookie's Secure
// flag: false for local http development, true in production over HTTPS.
func NewHandler(users *user.Repository, sessions *session.Repository, auditLog *audit.Repository, secureCookies bool) *Handler {
	return &Handler{users: users, sessions: sessions, audit: auditLog, secureCookies: secureCookies}
}

// record writes an audit entry, logging rather than failing when it cannot.
// Authentication events have no surrounding transaction to join, so a lost
// entry must not break the login itself. This is deliberately asymmetric with
// privileged mutations, which use RecordTx and DO fail if the entry is lost.
func (h *Handler) record(ctx context.Context, e audit.Entry) {
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
			h.record(r.Context(), audit.Entry{
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
		h.record(r.Context(), audit.Entry{
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
	if _, err := h.sessions.Create(r.Context(), tokenHash, u.ID, expiresAt); err != nil {
		log.Printf("login: create session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.record(r.Context(), audit.Entry{
		ActorID:    &u.ID,
		ActorEmail: u.Email,
		Action:     audit.ActionLogin,
		Outcome:    audit.OutcomeSuccess,
		IP:         ip,
	})

	// 4) Send the RAW token to the browser in a hardened cookie. The database
	// holds only its hash, so this cookie is the only copy of the secret.
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
	u, err := h.users.GetByID(r.Context(), p.ID)
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
// clear the cookie. It is public and idempotent — a missing or already-invalid
// cookie still yields a clean 204, and the cookie is always expired.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	// If a session cookie is present, delete its row so the token is truly
	// revoked server-side — not merely forgotten by the browser.
	if c, err := r.Cookie(cookieName); err == nil {
		tokenHash := session.HashToken(c.Value)

		// Identify the session's owner BEFORE deleting it, so the audit entry
		// can name them. Costs two reads on a logout, which is a fair price for
		// a complete session lifecycle in the trail. A cookie that matches no
		// live session simply yields no entry: there is nobody to name.
		var actor *user.User
		if sess, err := h.sessions.GetByTokenHash(r.Context(), tokenHash); err == nil {
			if u, err := h.users.GetByID(r.Context(), sess.UserID); err == nil {
				actor = &u
			}
		}

		if err := h.sessions.DeleteByTokenHash(r.Context(), tokenHash); err != nil {
			log.Printf("logout: delete session: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		if actor != nil {
			h.record(r.Context(), audit.Entry{
				ActorID:    &actor.ID,
				ActorEmail: actor.Email,
				Action:     audit.ActionLogout,
				Outcome:    audit.OutcomeSuccess,
				IP:         audit.ClientIP(r),
			})
		}
	}

	// Always overwrite the cookie with an expired one so the browser drops it.
	// Name and Path must match the login cookie or the browser won't replace it.
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.secureCookies,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1, // negative MaxAge tells the browser to delete it immediately
	})

	w.WriteHeader(http.StatusNoContent)
}
