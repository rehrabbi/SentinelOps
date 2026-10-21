// Package audit records who did what, to what, and when. It is not application
// logging: log.Printf exists so we can debug, this exists for accountability
// long after the fact.
//
// The database owns the integrity guarantees. A BEFORE INSERT trigger hash
// chains every row to its predecessor, and UPDATE, DELETE and TRUNCATE are
// refused, so nothing here can forge, edit or skip an entry.
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
)

// Action names are dotted and stable, because they are queried later. Adding a
// new kind of event is a new constant here plus new detail keys, never a
// migration.
const (
	ActionLogin       = "user.login"
	ActionLoginFailed = "user.login_failed"
	ActionLogout      = "user.logout"
	ActionRoleChanged = "user.role_changed"
)

const (
	OutcomeSuccess = "success"
	OutcomeFailure = "failure"
)

// execer is satisfied by both *sql.DB and *sql.Tx. Accepting it is what lets an
// audit entry join a caller's transaction, so a privileged change and its
// record commit together or not at all.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// Entry is one audit record. Pointer fields are the ones that are genuinely
// absent sometimes: a failed login has no actor id, and not every action has a
// target.
type Entry struct {
	ActorID    *string
	ActorEmail string
	Action     string
	TargetType *string
	TargetID   *string
	Outcome    string
	Detail     map[string]any
	IP         *string
}

// Repository writes audit entries.
type Repository struct {
	db *sql.DB
}

// NewRepository wires a Repository to a database pool.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Record writes an entry on its own connection. Use it for events with no
// surrounding transaction, such as a login or a logout.
func (r *Repository) Record(ctx context.Context, e Entry) error {
	return write(ctx, r.db, e)
}

// RecordTx writes an entry inside the caller's transaction, so the entry and
// the change it describes share a fate. Use it for every privileged mutation.
func (r *Repository) RecordTx(ctx context.Context, tx *sql.Tx, e Entry) error {
	return write(ctx, tx, e)
}

// write is the single INSERT. prev_hash and entry_hash are deliberately absent
// from the column list: the trigger computes them, and anything we sent would
// be discarded anyway.
func write(ctx context.Context, q execer, e Entry) error {
	const query = `
		INSERT INTO audit_log
			(actor_id, actor_email, action, target_type, target_id, outcome, detail, ip)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	detail := e.Detail
	if detail == nil {
		detail = map[string]any{}
	}
	encoded, err := json.Marshal(detail)
	if err != nil {
		return fmt.Errorf("encode audit detail: %w", err)
	}

	_, err = q.ExecContext(ctx, query,
		e.ActorID, e.ActorEmail, e.Action, e.TargetType, e.TargetID,
		e.Outcome, encoded, e.IP)
	if err != nil {
		return fmt.Errorf("write audit entry: %w", err)
	}
	return nil
}

// ClientIP returns the direct peer address, without its port. RemoteAddr is
// trustworthy because the kernel supplies it. X-Forwarded-For is deliberately
// ignored: it is client-controlled, so trusting it unconditionally lets anyone
// forge the source address in the audit trail. Once a proxy sits in front, this
// must be revisited to trust that specific proxy and nothing else.
func ClientIP(r *http.Request) *string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return nil
	}
	if host == "" {
		return nil
	}
	return &host
}
