package user

import (
	"context"
	"database/sql"
	"fmt"
)

// Repository is the data-access layer for users. It owns the *sql.DB pool and
// is the ONLY place that knows SQL. Handlers call methods here; they never
// touch the database directly.
type Repository struct {
	db *sql.DB
}

// NewRepository wires a Repository to a database pool.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// List returns all users, newest first.
//
// Note we do NOT select password_hash — a list endpoint has no need for it, so
// we don't load it into memory at all. (Pagination and access control come
// later; for now this returns everyone.)
func (r *Repository) List(ctx context.Context) ([]User, error) {
	const query = `
		SELECT id, email, full_name, created_at, updated_at
		FROM users
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close() // always close rows to release the connection back to the pool

	// Start with an empty (non-nil) slice so "no users" encodes as [] not null.
	users := make([]User, 0)
	for rows.Next() {
		var u User
		// Scan copies the columns of the current row into these fields, IN THE
		// SAME ORDER as the SELECT. Mismatched order/count is a bug.
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}

	// rows.Next() returning false can mean "done" OR "an error occurred" —
	// rows.Err() distinguishes them. Always check it after the loop.
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}

	return users, nil
}
