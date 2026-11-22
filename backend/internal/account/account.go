// Package account lets people keep control of their own account after it
// exists: change their password, end every session they have, and, when a
// password is forgotten, recover through a one-time reset an admin issues.
//
// Every change here commits together with its audit entry and with the
// sessions it ends, so a password is never changed while an old session
// quietly survives, and never changed without a record.
package account

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sentinelops/internal/audit"
	"sentinelops/internal/authctx"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

// ResetLifetime is how long a reset link works. A reset is a credential for an
// existing account, so it is far shorter than an invite: long enough for an
// admin to pass it on, short enough that a link left in a chat goes stale.
const ResetLifetime = time.Hour

var (
	// ErrWrongPassword: the current password given with a change is not the
	// account's password.
	ErrWrongPassword = errors.New("current password is incorrect")
	// ErrSamePassword: the new password is the one already in use.
	ErrSamePassword = fmt.Errorf("%w: the new password must differ from the current one", user.ErrValidation)
	// ErrOwnAccount: admins change their own password, not reset it.
	ErrOwnAccount = errors.New("use Change password for your own account")
	// ErrResetNotUsable: the token is unknown, used, or expired. The three are
	// deliberately indistinguishable to whoever presents it.
	ErrResetNotUsable = errors.New("reset link not found or expired")
)

// tokenPattern is the shape of a raw token: 64 hex characters (256 bits).
var tokenPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// hashPassword uses the same bcrypt cost as every other password.
func hashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(h), nil
}

// Service holds what every account operation needs.
type Service struct {
	db    *sql.DB
	users *user.Repository
	audit *audit.Repository
}

// NewService wires the operations to the pool, the users, and the audit log.
func NewService(db *sql.DB, users *user.Repository, auditLog *audit.Repository) *Service {
	return &Service{db: db, users: users, audit: auditLog}
}

// ChangePassword replaces the caller's password after checking the current
// one, and ends every other session of theirs: the one making the change,
// keepHash, survives, so the person is not logged out of the tab they are in.
// A wrong current password is recorded as a failure and returns
// ErrWrongPassword.
func (s *Service) ChangePassword(ctx context.Context, caller authctx.Principal, current, next, keepHash string, ip *string) error {
	stored, err := s.users.PasswordHash(ctx, caller.ID)
	if err != nil {
		return err
	}
	// Authenticate before anything else: without the current password, the
	// request learns nothing, not even whether the new password would pass.
	if bcrypt.CompareHashAndPassword([]byte(stored), []byte(current)) != nil {
		if err := s.audit.Record(ctx, audit.Entry{
			ActorID:    &caller.ID,
			ActorEmail: caller.Email,
			Action:     audit.ActionPasswordChanged,
			Outcome:    audit.OutcomeFailure,
			Detail:     map[string]any{"reason": "bad_password"},
			IP:         ip,
		}); err != nil {
			return fmt.Errorf("change password: audit failure: %w", err)
		}
		return ErrWrongPassword
	}
	if err := user.ValidatePassword(next); err != nil {
		return err
	}
	if next == current {
		return ErrSamePassword
	}
	hash, err := hashPassword(next)
	if err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("change password: begin: %w", err)
	}
	defer tx.Rollback() // no-op after Commit

	if _, err := s.users.SetPasswordHash(ctx, tx, caller.ID, hash); err != nil {
		return fmt.Errorf("change password: %w", err)
	}
	ended, err := session.DeleteForUser(ctx, tx, caller.ID, keepHash)
	if err != nil {
		return fmt.Errorf("change password: %w", err)
	}
	if err := s.audit.RecordTx(ctx, tx, audit.Entry{
		ActorID:    &caller.ID,
		ActorEmail: caller.Email,
		Action:     audit.ActionPasswordChanged,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"sessions_ended": ended},
		IP:         ip,
	}); err != nil {
		return fmt.Errorf("change password: audit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("change password: commit: %w", err)
	}
	return nil
}

// LogoutEverywhere ends every session of the caller, including the current
// one, for when a device was lost or a login looks unfamiliar.
func (s *Service) LogoutEverywhere(ctx context.Context, caller authctx.Principal, ip *string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("log out everywhere: begin: %w", err)
	}
	defer tx.Rollback()

	ended, err := session.DeleteForUser(ctx, tx, caller.ID, "")
	if err != nil {
		return fmt.Errorf("log out everywhere: %w", err)
	}
	if err := s.audit.RecordTx(ctx, tx, audit.Entry{
		ActorID:    &caller.ID,
		ActorEmail: caller.Email,
		Action:     audit.ActionLogoutAll,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"sessions_ended": ended},
		IP:         ip,
	}); err != nil {
		return fmt.Errorf("log out everywhere: audit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("log out everywhere: commit: %w", err)
	}
	return nil
}

// Reset is an issued reset, without its token: what the admin sees.
type Reset struct {
	Email     string    `json:"email"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// IssueReset creates a one-time reset for the account userID, on behalf of
// the admin by, and records it in the same transaction. Any earlier reset of
// that account that is still pending stops working, so only the newest link
// is ever live. It returns the raw token, which is stored only as its SHA-256
// hash and cannot be recovered later.
func (s *Service) IssueReset(ctx context.Context, by authctx.Principal, userID string, ip *string) (string, Reset, error) {
	if userID == by.ID {
		return "", Reset{}, ErrOwnAccount
	}
	raw, hash, err := session.GenerateToken()
	if err != nil {
		return "", Reset{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", Reset{}, fmt.Errorf("issue reset: begin: %w", err)
	}
	defer tx.Rollback()

	var rs Reset
	if err := tx.QueryRowContext(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&rs.Email); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", Reset{}, user.ErrUserNotFound
		}
		return "", Reset{}, fmt.Errorf("issue reset: get user: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, userID); err != nil {
		return "", Reset{}, fmt.Errorf("issue reset: retire earlier resets: %w", err)
	}
	err = tx.QueryRowContext(ctx, `
		INSERT INTO password_resets (token_hash, user_id, created_by, expires_at)
		VALUES ($1, $2, $3, now() + $4::interval)
		RETURNING expires_at`,
		hash, userID, by.ID, fmt.Sprintf("%d seconds", int(ResetLifetime.Seconds())),
	).Scan(&rs.ExpiresAt)
	if err != nil {
		return "", Reset{}, fmt.Errorf("issue reset: insert: %w", err)
	}

	targetType := "user"
	if err := s.audit.RecordTx(ctx, tx, audit.Entry{
		ActorID:    &by.ID,
		ActorEmail: by.Email,
		Action:     audit.ActionPasswordResetIssued,
		TargetType: &targetType,
		TargetID:   &userID,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"email": rs.Email, "expires_at": rs.ExpiresAt},
		IP:         ip,
	}); err != nil {
		return "", Reset{}, fmt.Errorf("issue reset: audit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", Reset{}, fmt.Errorf("issue reset: commit: %w", err)
	}
	return raw, rs, nil
}

// AcceptReset sets a new password through a reset token and ends every
// session of that account: whoever was logged in with the old password is
// logged out. A password that breaks the rules returns a user.ErrValidation
// error before the token is touched, so the link stays usable.
func (s *Service) AcceptReset(ctx context.Context, token, password string, ip *string) error {
	if !tokenPattern.MatchString(token) {
		return ErrResetNotUsable
	}
	if err := user.ValidatePassword(password); err != nil {
		return err
	}
	// Hash before the transaction, so no row stays locked during bcrypt.
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("accept reset: begin: %w", err)
	}
	defer tx.Rollback()

	// Claim it: the WHERE clause and the update are one statement, so two
	// simultaneous uses of the same token cannot both succeed.
	var userID string
	err = tx.QueryRowContext(ctx, `
		UPDATE password_resets SET used_at = now()
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
		RETURNING user_id`,
		session.HashToken(token),
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrResetNotUsable
	}
	if err != nil {
		return fmt.Errorf("accept reset: claim: %w", err)
	}

	email, err := s.users.SetPasswordHash(ctx, tx, userID, hash)
	if err != nil {
		return fmt.Errorf("accept reset: %w", err)
	}
	ended, err := session.DeleteForUser(ctx, tx, userID, "")
	if err != nil {
		return fmt.Errorf("accept reset: %w", err)
	}
	if err := s.audit.RecordTx(ctx, tx, audit.Entry{
		ActorID:    &userID,
		ActorEmail: email,
		Action:     audit.ActionPasswordResetComplete,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"sessions_ended": ended},
		IP:         ip,
	}); err != nil {
		return fmt.Errorf("accept reset: audit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("accept reset: commit: %w", err)
	}
	return nil
}
