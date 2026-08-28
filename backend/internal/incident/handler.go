package incident

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"

	"sentinelops/internal/auth"
)

const maxBodyBytes = 1 << 20 // 1 MiB request-body cap

// validSeverities mirrors the DB CHECK constraint, so we can reject a bad value
// with a clean 400 instead of relying on a database error.
var validSeverities = map[string]bool{
	"low": true, "medium": true, "high": true, "critical": true,
}

// uuidPattern matches the canonical 8-4-4-4-12 hexadecimal UUID form. Checking
// the shape here means a malformed id becomes a clean 404 instead of reaching
// Postgres, which would reject it as invalid uuid syntax and surface as a 500.
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Handler serves the incident HTTP endpoints. It depends on the incident
// repository and (via the context) the authenticated user.
type Handler struct {
	incidents *Repository
}

// NewHandler wires a Handler to the incident repository.
func NewHandler(incidents *Repository) *Handler {
	return &Handler{incidents: incidents}
}

// createInput is the POST /api/incidents body. There is deliberately NO status
// or userId field: status always starts 'open', and the owner is the
// authenticated user. Accepting either from the client would be a security bug
// (status-skipping / ownership forgery).
type createInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Severity    string `json:"severity"`
}

// Create handles POST /api/incidents: create an incident owned by the caller.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// Same input hardening as registration: cap the body, parse strictly.
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var in createInput
	if err := dec.Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)

	if in.Title == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}
	if len(in.Title) > 200 {
		http.Error(w, "title must be at most 200 characters", http.StatusBadRequest)
		return
	}
	if len(in.Description) > 5000 {
		http.Error(w, "description must be at most 5000 characters", http.StatusBadRequest)
		return
	}
	// Severity defaults to 'medium' when omitted; otherwise it must be valid.
	if in.Severity == "" {
		in.Severity = "medium"
	} else if !validSeverities[in.Severity] {
		http.Error(w, "invalid severity", http.StatusBadRequest)
		return
	}

	inc, err := h.incidents.Create(r.Context(), user.ID, in.Title, in.Description, in.Severity)
	if err != nil {
		log.Printf("create incident: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Location", "/api/incidents/"+inc.ID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(inc); err != nil {
		log.Printf("create incident: encode: %v", err)
	}
}

// List handles GET /api/incidents. RBAC policy lives HERE: reporters (and any
// unrecognized role) see only their own incidents; analysts and admins see all.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	var (
		incidents []Incident
		err       error
	)
	switch user.Role {
	case "analyst", "admin":
		incidents, err = h.incidents.ListAll(r.Context())
	default: // "reporter" and any future least-privileged role — fail safe
		incidents, err = h.incidents.ListByUser(r.Context(), user.ID)
	}
	if err != nil {
		log.Printf("list incidents: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(incidents); err != nil {
		log.Printf("list incidents: encode: %v", err)
	}
}

// Get handles GET /api/incidents/{id}. This is per-object authorization:
// reporters may read only their own incident, analysts and admins may read any.
// The ownership test lives in the SQL, and a miss returns 404 — byte-identical
// to a nonexistent id, so the API never confirms that an incident exists.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	// The id comes straight from the URL, so it is untrusted input. Reject
	// anything that is not UUID-shaped before it reaches the database.
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.Error(w, "incident not found", http.StatusNotFound)
		return
	}

	var (
		inc Incident
		err error
	)
	switch user.Role {
	case "analyst", "admin":
		inc, err = h.incidents.GetByID(r.Context(), id)
	default: // "reporter" and any future least-privileged role — fail safe
		inc, err = h.incidents.GetByIDForUser(r.Context(), id, user.ID)
	}
	if errors.Is(err, ErrIncidentNotFound) {
		http.Error(w, "incident not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("get incident: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(inc); err != nil {
		log.Printf("get incident: encode: %v", err)
	}
}
