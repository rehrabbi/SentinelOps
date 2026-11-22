package account

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"

	"sentinelops/internal/audit"
	"sentinelops/internal/auth"
	"sentinelops/internal/authctx"
	"sentinelops/internal/user"
)

// maxBodyBytes caps request bodies; every body here is tiny.
const maxBodyBytes = 1 << 20

// uuidPattern matches the canonical 8-4-4-4-12 form of a user id.
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Handler is the HTTP layer over Service.
type Handler struct {
	svc           *Service
	secureCookies bool
}

// NewHandler wraps svc. secureCookies must match the login cookie's setting,
// or "log out everywhere" could not overwrite the cookie.
func NewHandler(svc *Service, secureCookies bool) *Handler {
	return &Handler{svc: svc, secureCookies: secureCookies}
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

type changeInput struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// ChangePassword handles PUT /api/me/password, behind RequireAuth. A wrong
// current password is 403, not 401: the caller IS logged in, and 401 would
// tell the frontend the session had ended.
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	caller, ok := authctx.FromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var in changeInput
	if !decodeStrict(w, r, &in) {
		return
	}
	keep, _ := auth.CurrentTokenHash(r)

	err := h.svc.ChangePassword(r.Context(), caller, in.CurrentPassword, in.NewPassword, keep, audit.ClientIP(r))
	switch {
	case errors.Is(err, ErrWrongPassword):
		http.Error(w, ErrWrongPassword.Error(), http.StatusForbidden)
	case errors.Is(err, user.ErrValidation):
		http.Error(w, user.ValidationMessage(err), http.StatusBadRequest)
	case err != nil:
		log.Printf("change password: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// LogoutEverywhere handles DELETE /api/sessions, behind RequireAuth: every
// session of the caller ends, this one included, and the cookie is cleared.
func (h *Handler) LogoutEverywhere(w http.ResponseWriter, r *http.Request) {
	caller, ok := authctx.FromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	if err := h.svc.LogoutEverywhere(r.Context(), caller, audit.ClientIP(r)); err != nil {
		log.Printf("log out everywhere: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	auth.ExpireCookie(w, h.secureCookies)
	w.WriteHeader(http.StatusNoContent)
}

// issuedReset is the response to an admin: the reset, and its token, once.
type issuedReset struct {
	Reset
	Token string `json:"token"`
}

// IssueReset handles POST /api/users/{id}/password-reset. The route is
// admin-only (RequireRole); the service refuses the admin's own account.
func (h *Handler) IssueReset(w http.ResponseWriter, r *http.Request) {
	caller, ok := authctx.FromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	token, rs, err := h.svc.IssueReset(r.Context(), caller, id, audit.ClientIP(r))
	switch {
	case errors.Is(err, ErrOwnAccount):
		http.Error(w, ErrOwnAccount.Error(), http.StatusForbidden)
		return
	case errors.Is(err, user.ErrUserNotFound):
		http.Error(w, "user not found", http.StatusNotFound)
		return
	case err != nil:
		log.Printf("issue reset: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// The response carries a credential: no cache anywhere may keep it.
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(issuedReset{Reset: rs, Token: token}); err != nil {
		log.Printf("issue reset: encode: %v", err)
	}
}

type acceptInput struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

// AcceptReset handles POST /api/password-resets/accept. It is public, because
// the person using it cannot log in; the token is the credential. It travels
// in the body, never the URL, so it stays out of logs.
func (h *Handler) AcceptReset(w http.ResponseWriter, r *http.Request) {
	var in acceptInput
	if !decodeStrict(w, r, &in) {
		return
	}
	err := h.svc.AcceptReset(r.Context(), in.Token, in.NewPassword, audit.ClientIP(r))
	switch {
	case errors.Is(err, ErrResetNotUsable):
		http.Error(w, ErrResetNotUsable.Error(), http.StatusNotFound)
	case errors.Is(err, user.ErrValidation):
		http.Error(w, user.ValidationMessage(err), http.StatusBadRequest)
	case err != nil:
		log.Printf("accept reset: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
