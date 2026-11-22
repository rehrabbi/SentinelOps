#!/usr/bin/env bash
# Gives one of the read-only database logins a new random password and stores
# its new connection string in the GitHub environment that uses it. The
# password is generated in memory and passed only through environment
# variables and pipes: it never appears on a command line, in output, or in a
# file. Use it when a password may have leaked, or to rehearse rotation.
#
#   audit_verifier  -> environment "audit",  secret AUDIT_DATABASE_URL
#   backup_reader   -> environment "backup", secret BACKUP_DATABASE_URL
#
# Usage:
#   infra/rotate-readonly-role.sh audit_verifier
#   infra/rotate-readonly-role.sh backup_reader
# Then run the workflow that uses it (Audit verify or Backup) to prove the new
# password works. The old one stops working the moment this script succeeds.
#
# Needs Docker, the gh CLI logged in, and PROD_DATABASE_URL (the owner login)
# in .env or the environment.
set -euo pipefail

repo="rehrabbi/SentinelOps"
role="${1:-}"
case "$role" in
  audit_verifier) environment=audit; secret=AUDIT_DATABASE_URL ;;
  backup_reader) environment=backup; secret=BACKUP_DATABASE_URL ;;
  *)
    echo "usage: $0 audit_verifier|backup_reader" >&2
    exit 2
    ;;
esac

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${PROD_DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ] && [ -f "$repo_dir/.env" ]; then
  DATABASE_URL="$(grep -m1 '^PROD_DATABASE_URL=' "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true)"
fi
[ -n "$DATABASE_URL" ] || { echo "PROD_DATABASE_URL is not set and not in .env" >&2; exit 1; }
export DATABASE_URL

py() { python -I "$@" 2>/dev/null || python3 -I "$@"; }

NEW_PASSWORD="$(py -c 'import secrets; print(secrets.token_urlsafe(32))')"
export NEW_PASSWORD ROLE="$role"

# The role name is fixed above, never taken from input beyond the allowlist,
# and the password arrives through psql's \getenv, so neither is interpolated
# from a command line.
MSYS_NO_PATHCONV=1 docker run --rm -i --env DATABASE_URL --env NEW_PASSWORD postgres:17-alpine \
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v role="$role" <<'SQL'
\getenv new_password NEW_PASSWORD
ALTER ROLE :"role" PASSWORD :'new_password';
SQL
echo "$role has a new password in the database."

# Same host, database and parameters as the owner URL; only the login changes.
py -c '
import os, sys, urllib.parse as u
p = u.urlsplit(os.environ["DATABASE_URL"])
host = p.hostname + (":%d" % p.port if p.port else "")
user = os.environ["ROLE"] + ":" + os.environ["NEW_PASSWORD"]
sys.stdout.write(u.urlunsplit((p.scheme, user + "@" + host, p.path, p.query, "")))' |
  gh secret set "$secret" --env "$environment" --repo "$repo"
unset NEW_PASSWORD
echo "$secret in environment $environment now holds the new connection string."
