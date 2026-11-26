package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

const tokenBytes = 32

func GenerateToken() (raw string, hash string, err error) {
	b := make([]byte, tokenBytes)

	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate token: %w", err)
	}
	raw = hex.EncodeToString(b)
	return raw, HashToken(raw), nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// rowQuerier is satisfied by both *sql.DB and *sql.Tx, like execer below.
type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Create stores a new session, on q so a sign-in can commit the session and
// its audit entry together.
func (r *Repository) Create(ctx context.Context, q rowQuerier, tokenHash, userID string, expiresAt time.Time) (Session, error) {
	const query = `
		INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES ($1, $2, $3)
		RETURNING token_hash, user_id, created_at, expires_at`

	var s Session
	err := q.QueryRowContext(ctx, query, tokenHash, userID, expiresAt).
		Scan(&s.TokenHash, &s.UserID, &s.CreatedAt, &s.ExpiresAt)
	if err != nil {
		return Session{}, fmt.Errorf("insert session: %w", err)
	}
	return s, nil
}

var ErrSessionNotFound = errors.New("session not found")

func (r *Repository) GetByTokenHash(ctx context.Context, tokenHash string) (Session, error) {
	const query = `
	SELECT token_hash, user_id, created_at, expires_at
	FROM sessions
	WHERE token_hash = $1 AND expires_at > now()`

	var s Session
	err := r.db.QueryRowContext(ctx, query, tokenHash).
		Scan(&s.TokenHash, &s.UserID, &s.CreatedAt, &s.ExpiresAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Session{}, ErrSessionNotFound
		}
		return Session{}, fmt.Errorf("get session by token hash: %w", err)
	}
	return s, nil
}

// DeleteByTokenHash ends one session and returns the id of the user it
// belonged to, on q so a sign-out can commit the deletion and its audit entry
// together. It returns ErrSessionNotFound when no live session was ended: the
// token matched nothing, or only an expired row, which is removed all the same.
//
// The user id comes from the deletion itself rather than an earlier read, so
// only the caller whose DELETE actually removed the row learns who it was. Of
// two concurrent sign-outs with one cookie, the second waits on the row lock,
// then deletes nothing.
func (r *Repository) DeleteByTokenHash(ctx context.Context, q rowQuerier, tokenHash string) (string, error) {
	const query = `
	DELETE FROM sessions
	WHERE token_hash = $1
	RETURNING user_id, expires_at > now()`

	var userID string
	var live bool
	err := q.QueryRowContext(ctx, query, tokenHash).Scan(&userID, &live)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrSessionNotFound
		}
		return "", fmt.Errorf("delete session: %w", err)
	}
	if !live {
		return "", ErrSessionNotFound
	}
	return userID, nil
}

// execer is satisfied by both *sql.DB and *sql.Tx.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// DeleteForUser ends every session of a user except the one whose token hash
// is keepHash (pass "" to end them all), on q so it can share a transaction
// with a password change. It returns how many sessions ended.
func DeleteForUser(ctx context.Context, q execer, userID, keepHash string) (int64, error) {
	res, err := q.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, userID, keepHash)
	if err != nil {
		return 0, fmt.Errorf("end sessions: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}
