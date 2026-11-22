package invite

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"golang.org/x/crypto/bcrypt"

	"sentinelops/internal/audit"
	"sentinelops/internal/authctx"
	"sentinelops/internal/user"
)

// maxBodyBytes caps request bodies; an invite or an acceptance is tiny.
const maxBodyBytes = 1 << 20

// hashPassword uses the same bcrypt cost registration always used.
func hashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// Handler serves the invite endpoints.
type Handler struct {
	db    *sql.DB
	users *user.Repository
	audit *audit.Repository
}

// NewHandler wires the handler to the pool, the user repository, and the audit log.
func NewHandler(db *sql.DB, users *user.Repository, auditLog *audit.Repository) *Handler {
	return &Handler{db: db, users: users, audit: auditLog}
}

// decodeStrict reads one JSON object, rejecting unknown fields, trailing data
// and oversize bodies, the same way every other endpoint does.
func decodeStrict(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil || dec.More() {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return false
	}
	return true
}

type createInput struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// issued is the response to an admin: the invite, and its token, once.
type issued struct {
	Invite
	Token string `json:"token"`
}

// Create handles POST /api/invites. The route is admin-only (RequireRole).
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	caller, ok := authctx.FromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var in createInput
	if !decodeStrict(w, r, &in) {
		return
	}

	token, inv, err := Issue(r.Context(), h.db, h.audit, in.Email, in.Role, &caller, audit.ClientIP(r))
	switch {
	case errors.Is(err, user.ErrValidation):
		http.Error(w, user.ValidationMessage(err), http.StatusBadRequest)
		return
	case errors.Is(err, ErrAccountExists):
		http.Error(w, ErrAccountExists.Error(), http.StatusConflict)
		return
	case err != nil:
		log.Printf("create invite: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// The response carries a credential: no cache anywhere may keep it.
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(issued{Invite: inv, Token: token}); err != nil {
		log.Printf("create invite: encode: %v", err)
	}
}

type acceptInput struct {
	Token    string `json:"token"`
	FullName string `json:"fullName"`
	Password string `json:"password"`
}

// Accept handles POST /api/invites/accept. It is public, because the person
// accepting has no account yet; the token is the credential. It travels in
// the body, never the URL, so it stays out of logs.
func (h *Handler) Accept(w http.ResponseWriter, r *http.Request) {
	var in acceptInput
	if !decodeStrict(w, r, &in) {
		return
	}

	u, err := Accept(r.Context(), h.db, h.users, h.audit, in.Token, in.FullName, in.Password, audit.ClientIP(r))
	switch {
	case errors.Is(err, user.ErrValidation):
		http.Error(w, user.ValidationMessage(err), http.StatusBadRequest)
		return
	case errors.Is(err, ErrNotUsable):
		http.Error(w, ErrNotUsable.Error(), http.StatusNotFound)
		return
	case errors.Is(err, ErrAccountExists):
		http.Error(w, ErrAccountExists.Error(), http.StatusConflict)
		return
	case err != nil:
		log.Printf("accept invite: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("accept invite: encode: %v", err)
	}
}
