package audit

import (
	"context"
	"database/sql"
	"fmt"
)

// VerifyReport is the result of walking the hash chain.
type VerifyReport struct {
	Entries  int
	FirstBad int64  // id of the earliest broken entry, 0 when the chain is intact
	HeadHash string // hex of the newest entry_hash, empty when there are no entries
}

// Intact reports whether the chain verified end to end.
func (r VerifyReport) Intact() bool { return r.FirstBad == 0 }

// verifyQuery recomputes every entry's hash from its own columns and compares
// it with the stored value, and checks that each row's prev_hash matches the
// previous row's entry_hash.
//
// The recomputation lives in SQL rather than Go on purpose. The canonical form
// is already defined by the audit_log_seal trigger, and a second definition in
// Go would have to match Postgres's timestamp formatting and jsonb text
// normalization exactly. Any drift between the two would report tampering that
// never happened, which is worse than no check at all.
const verifyQuery = `
	WITH recomputed AS (
		SELECT id, entry_hash, prev_hash,
		       sha256(coalesce(prev_hash, ''::bytea) || convert_to(concat_ws('|',
		           to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
		           coalesce(actor_id::text, ''), actor_email, action,
		           coalesce(target_type, ''), coalesce(target_id, ''), outcome,
		           detail::text, coalesce(ip::text, '')), 'UTF8')) AS expected_hash,
		       lag(entry_hash) OVER (ORDER BY id) AS expected_prev
		FROM audit_log
	)
	SELECT
		(SELECT count(*) FROM audit_log),
		coalesce((SELECT min(id) FROM recomputed
		          WHERE entry_hash IS DISTINCT FROM expected_hash
		             OR prev_hash  IS DISTINCT FROM expected_prev), 0),
		coalesce((SELECT encode(entry_hash, 'hex') FROM audit_log
		          ORDER BY id DESC LIMIT 1), '')`

// Verify walks the audit chain and reports whether it is intact.
//
// What this detects: any edit to an existing entry, and any insertion or
// removal that breaks the links.
//
// What it does NOT detect: a rebuild of the entire chain by someone able to
// bypass the triggers, such as a database superuser, because they can recompute
// every hash. The defence against that is recording HeadHash somewhere outside
// this database and comparing it later.
func Verify(ctx context.Context, db *sql.DB) (VerifyReport, error) {
	var r VerifyReport
	err := db.QueryRowContext(ctx, verifyQuery).Scan(&r.Entries, &r.FirstBad, &r.HeadHash)
	if err != nil {
		return VerifyReport{}, fmt.Errorf("verify audit chain: %w", err)
	}
	return r, nil
}
