// Package auth implements authentication behavior: logging in (creating a
// session), logging out, and (soon) the middleware that protects routes.
package auth

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

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

// Handler wires the user and session repositories together to implement login.
// It depends on BOTH domains, which is why it lives in its own auth package.
type Handler struct {
	users         *user.Repository
	sessions      *session.Repository
	secureCookies bool
}

// NewHandler builds an auth Handler. secureCookies controls the cookie's Secure
// flag: false for local http development, true in production over HTTPS.
func NewHandler(users *user.Repository, sessions *session.Repository, secureCookies bool) *Handler {
	return &Handler{users: users, sessions: sessions, secureCookies: secureCookies}
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

	// 1) Find the user. A missing user must fail the SAME way as a wrong
	// password: generic message, same 401, similar timing.
	u, err := h.users.GetByEmail(r.Context(), in.Email)
	if err != nil {
		if errors.Is(err, user.ErrUserNotFound) {
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
