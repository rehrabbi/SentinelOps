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

func (r *Repository) Create(ctx context.Context, tokenHash, userID string, expiresAt time.Time) (Session, error) {
	const query = `
		INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES ($1, $2, $3)
		RETURNING token_hash, user_id, created_at, expires_at`

	var s Session
	err := r.db.QueryRowContext(ctx, query, tokenHash, userID, expiresAt).
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

func (r *Repository) DeleteByTokenHash(ctx context.Context, tokenHash string) error {
	const query = `DELETE FROM sessions WHERE token_hash = $1`

	if _, err := r.db.ExecContext(ctx, query, tokenHash); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
