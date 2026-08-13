package user

import (
	"encoding/json"
	"log"
	"net/http"
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
