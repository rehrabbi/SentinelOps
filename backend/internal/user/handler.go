package user

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"sentinelops/internal/audit"
	"sentinelops/internal/authctx"
)

// Handler is the HTTP layer for users. It translates HTTP requests into
// repository calls and repository results into HTTP responses. It knows
// nothing about SQL.
type Handler struct {
	repo  *Repository
	db    *sql.DB
	audit *audit.Repository
}

// NewHandler wires a Handler to a Repository. It also takes the pool itself and
// the audit repository, because a role change runs the update and its audit
// entry inside one transaction, which needs a connection the repository does
// not own.
func NewHandler(repo *Repository, db *sql.DB, auditLog *audit.Repository) *Handler {
	return &Handler{repo: repo, db: db, audit: auditLog}
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

// validRoles mirrors the CHECK constraint on users.role from migration 3.
// Checking here turns a bad value into a clean 400 instead of a database error.
var validRoles = map[string]bool{
	"reporter": true, "analyst": true, "admin": true,
}

// uuidPattern matches the canonical 8-4-4-4-12 form. The incident package has
// its own copy; if a third one appears, it is time for a shared helper.
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

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

// updateRoleInput is the PATCH /api/users/{id} body. Role is the ONLY field.
// Email, name, and password are deliberately absent, so this endpoint cannot
// quietly become a way to rewrite someone else's credentials.
type updateRoleInput struct {
	Role string `json:"role"`
}

// UpdateRole handles PATCH /api/users/{id}. The route is wrapped in
// RequireRole("admin"), so reaching this code already means the caller is an
// admin; what remains is to stop an admin from changing their OWN role.
//
// That refusal is what keeps the system administrable. An admin may demote any
// other admin, but never themselves, so the acting admin always survives and at
// least one admin always exists. Counting remaining admins instead would need
// the count and the write in one transaction, or two simultaneous demotions
// could both pass the check and leave nobody.
func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	caller, ok := authctx.FromContext(r.Context())
	if !ok {
		// Empty context means this was not placed behind RequireAuth.
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Authorization before validation: refuse the self change before we even
	// read the body, so a refused request is never partly processed.
	if id == caller.ID {
		http.Error(w, "you cannot change your own role", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var in updateRoleInput
	if err := dec.Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if !validRoles[in.Role] {
		http.Error(w, "invalid role", http.StatusBadRequest)
		return
	}

	// A privileged change and its audit entry share ONE transaction. If the
	// entry cannot be written, the change is rolled back: an action nobody can
	// account for must not happen. This is deliberately stricter than the
	// best-effort policy used for login and logout, which have no transaction
	// to join.
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		log.Printf("update user role: begin: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	// Rollback after a successful Commit is a no-op, so deferring it
	// unconditionally is safe and guarantees the connection is released on
	// every path, including the early returns below.
	defer tx.Rollback()

	u, previousRole, err := h.repo.UpdateRole(r.Context(), tx, id, in.Role)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		log.Printf("update user role: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	targetType := "user"
	if err := h.audit.RecordTx(r.Context(), tx, audit.Entry{
		ActorID:    &caller.ID,
		ActorEmail: caller.Email,
		Action:     audit.ActionRoleChanged,
		TargetType: &targetType,
		TargetID:   &u.ID,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"from": previousRole, "to": u.Role, "target_email": u.Email},
		IP:         audit.ClientIP(r),
	}); err != nil {
		// The deferred Rollback undoes the role change. The caller is told it
		// failed, which is true: nothing was committed.
		log.Printf("update user role: audit: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("update user role: commit: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("update user role: encode: %v", err)
	}
}
