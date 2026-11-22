#!/usr/bin/env bash
# Restore drill: proves a backup can actually be restored, and that it holds
# the same audit history GitHub has been anchoring, not just that a file exists.
#
# It takes the newest encrypted backup from GitHub (or --file), decrypts it
# inside a throwaway Postgres container, restores it there, checks the schema
# version, and runs verify-audit from the deployed API image against the newest
# anchor on the audit-anchors branch that the backup should contain. The
# decrypted dump and the private key exist only inside that container, which is
# removed at the end. Nothing touches production.
#
# Usage, from anywhere in the repository:
#   infra/restore-drill.sh                          # newest backup from GitHub
#   infra/restore-drill.sh --file backup.dump.age   # a downloaded file
# Options:
#   --identity <path>  the age private key (default $AGE_IDENTITY, then
#                      ~/.sentinelops/backup-key.txt)
#   --anchor <id:hash> check against this anchor instead of audit-anchors
#   --no-anchor        skip the anchor check (for non-production dumps)
#
# Needs Docker, and the gh CLI logged in when downloading from GitHub.
set -euo pipefail

repo="rehrabbi/SentinelOps"
infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

identity="${AGE_IDENTITY:-$HOME/.sentinelops/backup-key.txt}"
file=""
anchor=""
use_anchor=1
while [ $# -gt 0 ]; do
  case "$1" in
    --file) file="$2"; shift 2 ;;
    --identity) identity="$2"; shift 2 ;;
    --anchor) anchor="$2"; shift 2 ;;
    --no-anchor) use_anchor=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ ! -f "$identity" ]; then
  echo "age private key not found at $identity (set AGE_IDENTITY or --identity)" >&2
  exit 1
fi

# Git Bash on Windows rewrites anything that looks like a path. Container paths
# must reach Docker untouched, so that is switched off; host paths handed to a
# Windows program (gh, docker cp) are then converted explicitly with host().
export MSYS_NO_PATHCONV=1
host() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}

work="$(mktemp -d)"
name="sentinelops-restore-drill-$$"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

if [ -z "$file" ]; then
  artifact="$(gh api "repos/$repo/actions/artifacts?per_page=100" --jq '
    [.artifacts[] | select(.name | startswith("sentinelops-db-")) | select(.expired | not)]
    | sort_by(.created_at) | last | "\(.workflow_run.id) \(.name)"')"
  if [ -z "$artifact" ] || [ "$artifact" = "null null" ]; then
    echo "no unexpired backup artifact found" >&2
    exit 1
  fi
  run_id="${artifact%% *}"
  artifact_name="${artifact#* }"
  echo "Newest backup: $artifact_name (workflow run $run_id)"
  gh run download "$run_id" --repo "$repo" --name "$artifact_name" --dir "$(host "$work")"
  file="$work/sentinelops.dump.age"
fi
echo "Encrypted dump: $(wc -c <"$file") bytes"

# A throwaway Postgres of production's major version, on a private network
# shared only with the verify-audit container below.
docker network create "$name" >/dev/null
docker run -d --name "$name" --network "$name" \
  -e POSTGRES_PASSWORD=restore-drill-only -e POSTGRES_DB=sentinelops \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$name" pg_isready -U postgres -d sentinelops >/dev/null 2>&1 && break
  sleep 1
done
sleep 2

# The key and the ciphertext go into the container; the plaintext dump is only
# ever a pipe inside it. A full restore loads every row before creating any
# trigger (triggers live in the dump's last section), so the audit rows arrive
# exactly as stored, hashes included, and are not re-sealed on the way in.
docker cp "$(host "$file")" "$name:/tmp/backup.dump.age"
docker cp "$(host "$identity")" "$name:/tmp/backup-key.txt"
docker exec "$name" sh -c '
  set -e
  apk add --quiet --no-progress age >/dev/null
  age --decrypt --identity /tmp/backup-key.txt /tmp/backup.dump.age \
    | pg_restore --no-owner --no-privileges --exit-on-error -U postgres -d sentinelops
  rm -f /tmp/backup-key.txt /tmp/backup.dump.age'
echo "Restored into a throwaway database."

query() {
  docker exec "$name" psql -U postgres -d sentinelops -X -A -t -c "$1"
}
echo "Schema version (version|dirty): $(query 'SELECT version, dirty FROM schema_migrations')"
echo "Rows: $(query "SELECT (SELECT count(*) FROM users) || ' users, ' || (SELECT count(*) FROM incidents) || ' incidents, ' || (SELECT count(*) FROM audit_log) || ' audit entries'")"
head_id="$(query 'SELECT coalesce(max(id), 0) FROM audit_log')"

# The newest anchor the backup can contain: anchors recorded after the backup
# was taken name entries the backup never had.
if [ "$use_anchor" = 1 ] && [ -z "$anchor" ]; then
  anchor="$(gh api "repos/$repo/contents/anchors.log?ref=audit-anchors" --jq .content | base64 -d |
    awk -v head="$head_id" '!/^#/ && NF { split($2, a, ":"); if (a[1] + 0 <= head + 0) best = $2 } END { print best }')"
  if [ -z "$anchor" ]; then
    echo "No anchor at or below entry $head_id yet; checking the chain on its own." >&2
  fi
fi

image="ghcr.io/rehrabbi/sentinelops-api:$(tr -d '\r\n' <"$infra_dir/api-image-tag.txt")"
args=(verify-audit)
if [ "$use_anchor" = 1 ] && [ -n "$anchor" ]; then
  args+=(--anchor "$anchor")
fi
echo "Checking the restored audit chain with $image ${args[*]:1}"
docker run --rm --network "$name" \
  -e DATABASE_URL="postgres://postgres:restore-drill-only@$name:5432/sentinelops?sslmode=disable" \
  "$image" "${args[@]}" 2>&1 | grep -v PROXY_SECRET

echo "RESTORE DRILL PASSED"
