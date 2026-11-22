// Package invite is how accounts are created: an admin (or, for the first
// admin of a fresh database, the command line) issues a one-time invite, and
// the person it was meant for accepts it, choosing their own name and password.
//
// There is no open sign-up. With open sign-up anyone could learn whether an
// email had an account, by registering it and then logging in with the
// password they chose; no response wording can hide that. Invites remove the
// question entirely.
package invite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"time"

	"sentinelops/internal/audit"
	"sentinelops/internal/authctx"
	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

// Lifetime is how long an invite can be accepted. Long enough to reach
// someone, short enough that a forgotten link stops working.
const Lifetime = 24 * time.Hour

// cliActor names the command line in the audit trail, where there is no user.
const cliActor = "command-line"

// Invite is an issued invite, without its token. Its JSON is what the admin
// sees; the token itself travels separately and only once.
type Invite struct {
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	ExpiresAt time.Time `json:"expiresAt"`
}

var (
	// ErrAccountExists: the email already has an account, so there is no one to invite.
	ErrAccountExists = errors.New("an account with this email already exists")
	// ErrNotUsable: the token is unknown, already used, or expired. The three
	// are deliberately indistinguishable to whoever presents the token.
	ErrNotUsable = errors.New("invite not found or expired")
)

// tokenPattern is the shape of a raw token: 64 hex characters (256 bits).
var tokenPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Issue creates an invite for email with role and records it in the audit log
// in the same transaction. by is the admin issuing it, or nil for the command
// line. It returns the raw token, which is stored only as its SHA-256 hash and
// cannot be recovered later.
func Issue(ctx context.Context, db *sql.DB, auditLog *audit.Repository, email, role string, by *authctx.Principal, ip *string) (string, Invite, error) {
	email = user.NormalizeEmail(email)
	if err := user.ValidateEmail(email); err != nil {
		return "", Invite{}, err
	}
	if role == "" {
		role = "reporter"
	}
	if !user.ValidRoles[role] {
		return "", Invite{}, fmt.Errorf("%w: invalid role", user.ErrValidation)
	}

	raw, hash, err := session.GenerateToken()
	if err != nil {
		return "", Invite{}, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", Invite{}, fmt.Errorf("issue invite: begin: %w", err)
	}
	defer tx.Rollback() // no-op after Commit

	// An account for this address already exists: refuse. Admins can list
	// every user anyway, so telling them reveals nothing new.
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1)`, email).Scan(&exists); err != nil {
		return "", Invite{}, fmt.Errorf("issue invite: check email: %w", err)
	}
	if exists {
		return "", Invite{}, ErrAccountExists
	}

	inv := Invite{Email: email, Role: role}
	var createdBy *string
	actorEmail := cliActor
	if by != nil {
		createdBy = &by.ID
		actorEmail = by.Email
	}
	err = tx.QueryRowContext(ctx, `
		INSERT INTO invites (token_hash, email, role, created_by, expires_at)
		VALUES ($1, $2, $3, $4, now() + $5::interval)
		RETURNING expires_at`,
		hash, email, role, createdBy, fmt.Sprintf("%d seconds", int(Lifetime.Seconds())),
	).Scan(&inv.ExpiresAt)
	if err != nil {
		return "", Invite{}, fmt.Errorf("issue invite: insert: %w", err)
	}

	targetType := "invite"
	if err := auditLog.RecordTx(ctx, tx, audit.Entry{
		ActorID:    createdBy,
		ActorEmail: actorEmail,
		Action:     audit.ActionInvited,
		TargetType: &targetType,
		TargetID:   &email,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"role": role, "expires_at": inv.ExpiresAt},
		IP:         ip,
	}); err != nil {
		return "", Invite{}, fmt.Errorf("issue invite: audit: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return "", Invite{}, fmt.Errorf("issue invite: commit: %w", err)
	}
	return raw, inv, nil
}

// Accept creates the account an invite was issued for, marks the invite used,
// and records both in one transaction: either all of it happens or none of it.
// It returns user.ErrValidation-wrapped errors for a bad name or password (the
// invite stays usable), ErrNotUsable for a bad token, and ErrAccountExists if
// the address got an account some other way since the invite was issued.
func Accept(ctx context.Context, db *sql.DB, users *user.Repository, auditLog *audit.Repository, token, fullName, password string, ip *string) (user.User, error) {
	if !tokenPattern.MatchString(token) {
		return user.User{}, ErrNotUsable
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return user.User{}, fmt.Errorf("accept invite: begin: %w", err)
	}
	defer tx.Rollback()

	// Claim it: the WHERE clause and the update are one statement, so two
	// simultaneous accepts of the same token cannot both succeed.
	var email, role string
	err = tx.QueryRowContext(ctx, `
		UPDATE invites SET used_at = now()
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
		RETURNING email, role`,
		session.HashToken(token),
	).Scan(&email, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return user.User{}, ErrNotUsable
	}
	if err != nil {
		return user.User{}, fmt.Errorf("accept invite: claim: %w", err)
	}

	// The same rules as before invites existed, with the email from the invite.
	in := user.CreateInput{Email: email, FullName: fullName, Password: password}
	in.Normalize()
	if err := in.Validate(); err != nil {
		return user.User{}, err // rolled back: the invite stays usable
	}

	hash, err := hashPassword(in.Password)
	if err != nil {
		return user.User{}, fmt.Errorf("accept invite: %w", err)
	}

	u, err := users.Create(ctx, tx, in.Email, in.FullName, hash, role)
	if errors.Is(err, user.ErrEmailTaken) {
		return user.User{}, ErrAccountExists
	}
	if err != nil {
		return user.User{}, fmt.Errorf("accept invite: %w", err)
	}

	targetType := "invite"
	if err := auditLog.RecordTx(ctx, tx, audit.Entry{
		ActorID:    &u.ID,
		ActorEmail: u.Email,
		Action:     audit.ActionInviteAccepted,
		TargetType: &targetType,
		TargetID:   &u.Email,
		Outcome:    audit.OutcomeSuccess,
		Detail:     map[string]any{"role": u.Role},
		IP:         ip,
	}); err != nil {
		return user.User{}, fmt.Errorf("accept invite: audit: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return user.User{}, fmt.Errorf("accept invite: commit: %w", err)
	}
	return u, nil
}
