package user

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Handler is the HTTP layer for users. It translates HTTP requests into
// repository calls and repository results into HTTP responses. It knows
// nothing about SQL.
type Handler struct {
	repo *Repository
}

// NewHandler wires a Handler to a Repository.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// List handles GET /api/users.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	// r.Context() carries request cancellation/timeout down into the query, so
	// if the client disconnects, the DB work can be abandoned.
	users, err := h.repo.List(r.Context())
	if err != nil {
		// Log the REAL error server-side (for us to debug)...
		log.Printf("list users: %v", err)
		// ...but return a GENERIC message to the client. Never leak internal
		// errors (or DB details) to callers — that's sensitive-data exposure.
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(users); err != nil {
		// Headers/body may already be partly written here, so we can only log.
		log.Printf("encode users response: %v", err)
	}
}

// maxBodyBytes caps the request body so a malicious client can't stream a huge
// payload to exhaust server memory. A registration JSON is tiny; 1 MiB is plenty.
const maxBodyBytes = 1 << 20 // 1 MiB

// Create handles POST /api/users — user registration.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	// 1) Bound the body size BEFORE reading anything from it.
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	// 2) Parse JSON strictly: DisallowUnknownFields rejects any field we didn't
	// define, so typos and injected extras don't slip through silently.
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var in CreateInput
	if err := dec.Decode(&in); err != nil {
		// Malformed JSON, an unknown field, or an over-size body all land here.
		// Keep the message generic; never reflect the raw body back to the caller.
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	// Reject trailing data after the JSON object (e.g. "{...}{...}").
	if dec.More() {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// 3) Normalize (trim/lowercase) then validate against our rules.
	in.Normalize()
	if err := in.Validate(); err != nil {
		// Validation messages describe the RULE, so they're safe to return.
		http.Error(w, validationMessage(err), http.StatusBadRequest)
		return
	}

	// 4) Hash the password. bcrypt is deliberately slow and embeds a random
	// per-user salt inside the resulting hash string itself.
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("hash password: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// 5) Store it. The repository maps a duplicate email to ErrEmailTaken.
	u, err := h.repo.Create(r.Context(), in.Email, in.FullName, string(hash))
	if err != nil {
		switch {
		case errors.Is(err, ErrEmailTaken):
			// NOTE: a 409 here reveals the email IS registered (account
			// enumeration). We accept that tradeoff for clear UX in this app
			// and record it in the security log.
			http.Error(w, "email already registered", http.StatusConflict)
		default:
			log.Printf("create user: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
		return
	}

	// 6) Success: 201 Created, a Location header pointing at the new resource,
	// and the created user (never the hash — json:"-" guarantees that).
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Location", "/api/users/"+u.ID)
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("encode create response: %v", err)
	}
}

// validationMessage strips the "validation failed: " sentinel prefix so the
// client sees just the specific reason (e.g. "password must be at least 12
// characters").
func validationMessage(err error) string {
	return strings.TrimPrefix(err.Error(), ErrValidation.Error()+": ")
}
