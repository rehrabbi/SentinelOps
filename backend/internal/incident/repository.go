package incident

import (
	"context"
	"database/sql"
	"fmt"
)

// Repository is the data-access layer for incidents. Like the other
// repositories, it owns the *sql.DB and is the only place that knows the SQL.
type Repository struct {
	db *sql.DB
}

// NewRepository wires a Repository to a database pool.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Create inserts a new incident owned by userID and returns the stored row.
// status is intentionally NOT a parameter — a new incident always starts 'open'
// (the DB default). severity comes from the caller (validated in the handler).
// userID is the authenticated user; it is never taken from the request body.
func (r *Repository) Create(ctx context.Context, userID, title, description, severity string) (Incident, error) {
	const query = `
		INSERT INTO incidents (user_id, title, description, severity)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, title, description, status, severity, created_at, updated_at`

	var i Incident
	err := r.db.QueryRowContext(ctx, query, userID, title, description, severity).
		Scan(&i.ID, &i.UserID, &i.Title, &i.Description, &i.Status, &i.Severity, &i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		return Incident{}, fmt.Errorf("insert incident: %w", err)
	}
	return i, nil
}

// ListAll returns every incident, newest first. This is the analyst/admin view.
// The caller (handler) MUST check the role before calling it.
func (r *Repository) ListAll(ctx context.Context) ([]Incident, error) {
	const query = `
		SELECT id, user_id, title, description, status, severity, created_at, updated_at
		FROM incidents
		ORDER BY created_at DESC`
	return r.query(ctx, query)
}

// ListByUser returns only the incidents owned by userID, newest first. This is
// the reporter view: scoping by owner is the core defense against IDOR / broken
// access control.
func (r *Repository) ListByUser(ctx context.Context, userID string) ([]Incident, error) {
	const query = `
		SELECT id, user_id, title, description, status, severity, created_at, updated_at
		FROM incidents
		WHERE user_id = $1
		ORDER BY created_at DESC`
	return r.query(ctx, query, userID)
}

// query is the shared helper behind the List methods: run the SELECT, scan every
// row into a non-nil slice, and check rows.Err(). The variadic args let the same
// helper serve a query with or without a WHERE parameter.
func (r *Repository) query(ctx context.Context, query string, args ...any) ([]Incident, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query incidents: %w", err)
	}
	defer rows.Close()

	incidents := make([]Incident, 0)
	for rows.Next() {
		var i Incident
		if err := rows.Scan(&i.ID, &i.UserID, &i.Title, &i.Description, &i.Status, &i.Severity, &i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan incident: %w", err)
		}
		incidents = append(incidents, i)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate incidents: %w", err)
	}
	return incidents, nil
}
