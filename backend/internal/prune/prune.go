// Package prune deletes rows that have outlived their purpose: expired
// sessions, and invites and password resets a week after they were used or
// expired.
//
// Nothing here closes a security hole. Expired sessions are already refused
// (the lookup only matches expires_at > now()), and spent invites can no longer
// be accepted. It is data minimisation: those rows still record who logged in,
// was invited or had a password reset, and when, long after they mattered, and without pruning the
// tables only ever grow. The audit log keeps the permanent record.
package prune

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// InviteGrace is how long a used or expired invite or password reset is kept,
// so "did they ever use it?" can be answered without the audit log for a week.
const InviteGrace = 7 * 24 * time.Hour

// Counts is how many rows one run deleted from each table.
type Counts struct {
	Sessions, Invites, Resets int64
}

// Run deletes expired sessions, spent invites and spent password resets.
func Run(ctx context.Context, db *sql.DB) (Counts, error) {
	var c Counts
	res, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	if err != nil {
		return c, fmt.Errorf("prune sessions: %w", err)
	}
	c.Sessions, _ = res.RowsAffected()

	// Invites and resets share one rule: gone a week after use or expiry. The
	// table names are constants, never input.
	grace := fmt.Sprintf("%d seconds", int(InviteGrace.Seconds()))
	for _, t := range []struct {
		table string
		count *int64
	}{{"invites", &c.Invites}, {"password_resets", &c.Resets}} {
		res, err = db.ExecContext(ctx, `
			DELETE FROM `+t.table+`
			WHERE (used_at IS NOT NULL AND used_at < now() - $1::interval)
			   OR expires_at < now() - $1::interval`, grace)
		if err != nil {
			return c, fmt.Errorf("prune %s: %w", t.table, err)
		}
		*t.count, _ = res.RowsAffected()
	}
	return c, nil
}

// Pruner runs the cleanup at most once per interval, so a burst of logins does
// not repeat it. Safe for concurrent use.
type Pruner struct {
	every time.Duration
	now   func() time.Time
	run   func(context.Context) error

	mu   sync.Mutex
	last time.Time // zero until the first run, so the first login after a start prunes
}

// New returns a Pruner that cleans db at most once every interval.
func New(db *sql.DB, every time.Duration) *Pruner {
	return &Pruner{
		every: every,
		now:   time.Now,
		run: func(ctx context.Context) error {
			c, err := Run(ctx, db)
			if c.Sessions > 0 || c.Invites > 0 || c.Resets > 0 {
				log.Printf("prune: deleted %d expired sessions, %d spent invites and %d spent password resets",
					c.Sessions, c.Invites, c.Resets)
			}
			return err
		},
	}
}

// MaybeRun runs the cleanup if at least the interval has passed since the
// last run, claiming the slot first so concurrent callers do not both run it.
// A failure is logged and otherwise ignored: cleanup must never break the
// request that triggered it.
func (p *Pruner) MaybeRun() {
	p.mu.Lock()
	now := p.now()
	if !p.last.IsZero() && now.Sub(p.last) < p.every {
		p.mu.Unlock()
		return
	}
	p.last = now
	p.mu.Unlock()

	// Not the request's context: the response is already written, and the
	// client hanging up must not cancel the cleanup halfway.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := p.run(ctx); err != nil {
		log.Printf("prune: %v", err)
	}
}

// AfterLogin wraps the login handler: once it has answered 200, it runs the
// cleanup if due. Logging in is what creates sessions, so cleaning up here
// keeps the table bounded by the same activity that grows it.
func (p *Pruner) AfterLogin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if rec.status == http.StatusOK {
			p.MaybeRun()
		}
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
