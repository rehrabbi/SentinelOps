package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
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
		SELECT id, email, full_name, role, created_at, updated_at
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
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.CreatedAt, &u.UpdatedAt); err != nil {
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

// ErrEmailTaken is returned by Create when the email already exists. Defining it
// as a sentinel lets the handler use errors.Is(err, ErrEmailTaken) to detect the
// case and respond 409 — instead of fragile string-matching on the DB message.
var ErrEmailTaken = errors.New("email already taken")

// Create inserts a new user and returns the stored row.
//
// IMPORTANT: passwordHash must ALREADY be hashed (bcrypt). The repository never
// sees or handles plaintext passwords — that keeps the secret-handling in one
// place (the handler) and the data layer dumb about crypto.
func (r *Repository) Create(ctx context.Context, email, fullName, passwordHash string) (User, error) {
	const query = `
		INSERT INTO users (email, full_name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id, email, full_name, role, created_at, updated_at`

	var u User
	// QueryRowContext runs the INSERT and reads the single RETURNING row back in
	// one round-trip. Every value is a $N parameter — never string-concatenated —
	// so SQL injection is impossible here.
	err := r.db.QueryRowContext(ctx, query, email, fullName, passwordHash).
		Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		// Did our UNIQUE index on lower(email) reject a duplicate? Inspect the
		// Postgres error CODE (23505 = unique_violation) rather than its text —
		// codes are stable and locale-independent; messages are not.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrEmailTaken
		}
		return User{}, fmt.Errorf("insert user: %w", err)
	}
	return u, nil
}

var ErrUserNotFound = errors.New("user not found")

func (r *Repository) GetByEmail(ctx context.Context, email string) (User, error) {
	const query = `
	SELECT id, email, full_name, role, password_hash, created_at, updated_at
	FROM users
	WHERE lower(email) = lower($1)`

	var u User
	err := r.db.QueryRowContext(ctx, query, email).
		Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {

		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrUserNotFound
		}
		return User{}, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (User, error) {
	const query = `
	SELECT id, email, full_name, role, created_at, updated_at
	FROM users
	WHERE id = $1`

	var u User
	err := r.db.QueryRowContext(ctx, query, id).
		Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrUserNotFound
		}
		return User{}, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

// rowQuerier is satisfied by both *sql.DB and *sql.Tx. Taking it as a parameter
// is what lets a caller run this inside their own transaction, so a change and
// its audit entry commit together or not at all. Same idiom as the audit
// package's execer.
type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// UpdateRole sets a user's role and returns the stored row together with the
// role it had before, which the audit entry needs in order to record
// "reporter -> admin" rather than just "admin".
//
// The previous value comes from a CTE in the same statement rather than a
// separate SELECT. Every subquery in a statement is evaluated against the
// snapshot taken when the statement began, so `previous` sees the OLD role even
// though this statement is overwriting it. One round trip, and no window for
// another writer to slip in between a read and a write.
//
// The role string is validated by the caller, and the CHECK constraint on
// users.role is the backstop. The returned columns deliberately exclude
// password_hash, like every other read in this file.
func (r *Repository) UpdateRole(ctx context.Context, q rowQuerier, id, role string) (User, string, error) {
	const query = `
		WITH previous AS (
			SELECT role FROM users WHERE id = $1
		)
		UPDATE users
		SET role = $2, updated_at = now()
		WHERE id = $1
		RETURNING id, email, full_name, role, created_at, updated_at,
		          (SELECT role FROM previous)`

	var u User
	var previousRole string
	err := q.QueryRowContext(ctx, query, id, role).
		Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.CreatedAt, &u.UpdatedAt, &previousRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, "", ErrUserNotFound
		}
		return User{}, "", fmt.Errorf("update user role: %w", err)
	}
	return u, previousRole, nil
}
