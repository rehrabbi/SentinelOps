package audit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// VerifyReport is the result of walking the hash chain.
type VerifyReport struct {
	Entries  int
	FirstBad int64  // id of the earliest broken entry, 0 when the chain is intact
	HeadID   int64  // id of the newest entry, 0 when there are no entries
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
		coalesce((SELECT max(id) FROM audit_log), 0),
		coalesce((SELECT encode(entry_hash, 'hex') FROM audit_log
		          ORDER BY id DESC LIMIT 1), '')`

// Verify walks the audit chain and reports whether it is intact.
//
// What this detects: any edit to an existing entry, and any insertion or
// removal that breaks the links.
//
// What it does NOT detect: a rebuild of the entire chain by someone able to
// bypass the triggers, such as a database superuser, because they can recompute
// every hash. The defence against that is recording HeadID and HeadHash
// somewhere outside this database as an Anchor, and checking it with
// CheckAnchor later.
func Verify(ctx context.Context, db *sql.DB) (VerifyReport, error) {
	var r VerifyReport
	err := db.QueryRowContext(ctx, verifyQuery).Scan(&r.Entries, &r.FirstBad, &r.HeadID, &r.HeadHash)
	if err != nil {
		return VerifyReport{}, fmt.Errorf("verify audit chain: %w", err)
	}
	return r, nil
}

// Anchor is an entry's hash recorded outside the database: "entry ID had hash
// Hash". Every entry_hash covers the entry before it, so rewriting any entry
// up to ID, even with every later hash recomputed, changes the hash at ID.
type Anchor struct {
	ID   int64
	Hash string // 64 lowercase hex characters (SHA-256)
}

// String renders the anchor in the form ParseAnchor reads.
func (a Anchor) String() string { return fmt.Sprintf("%d:%s", a.ID, a.Hash) }

var sha256Hex = regexp.MustCompile(`^[0-9a-f]{64}$`)

// ParseAnchor reads "<id>:<sha256 hex>", as printed by verify-audit. It is
// strict, because a malformed anchor that silently checked nothing would be
// worse than an error.
func ParseAnchor(s string) (Anchor, error) {
	idText, hash, found := strings.Cut(strings.TrimSpace(s), ":")
	if !found {
		return Anchor{}, fmt.Errorf("anchor %q: want <id>:<hash>", s)
	}
	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id < 1 {
		return Anchor{}, fmt.Errorf("anchor %q: id must be a positive whole number", s)
	}
	if !sha256Hex.MatchString(hash) {
		return Anchor{}, fmt.Errorf("anchor %q: hash must be 64 lowercase hex characters", s)
	}
	return Anchor{ID: id, Hash: hash}, nil
}

// ErrAnchorMismatch means the anchored entry is gone or its hash changed: the
// chain was rewritten at or before the anchor, even if it verifies on its own.
var ErrAnchorMismatch = errors.New("audit chain does not match its anchor")

// CheckAnchor confirms that the anchored entry still exists with the anchored
// hash. Run it alongside Verify: Verify proves the chain is consistent, and
// CheckAnchor proves it is the same chain that was anchored.
func CheckAnchor(ctx context.Context, db *sql.DB, a Anchor) error {
	var got string
	err := db.QueryRowContext(ctx,
		`SELECT encode(entry_hash, 'hex') FROM audit_log WHERE id = $1`, a.ID).Scan(&got)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%w: entry %d no longer exists", ErrAnchorMismatch, a.ID)
	}
	if err != nil {
		return fmt.Errorf("check audit anchor: %w", err)
	}
	if got != a.Hash {
		return fmt.Errorf("%w: entry %d has hash %s, anchored %s", ErrAnchorMismatch, a.ID, got, a.Hash)
	}
	return nil
}
