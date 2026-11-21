#!/usr/bin/env bash
# Applies database migrations to the production database, using the exact API
# image that Terraform is about to deploy (infra/api-image-tag.txt). Run it
# BEFORE `infra/terraform.sh apply` whenever that tag changes, so the API never
# starts against an older schema.
#
# Usage, from anywhere in the repository:
#   infra/migrate.sh
set -euo pipefail

image_repo="ghcr.io/rehrabbi/sentinelops-api"

infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$infra_dir")"

tag="$(tr -d '\r\n' <"$infra_dir/api-image-tag.txt")"
if ! [[ "$tag" =~ ^sha-[0-9a-f]{40}$ ]]; then
  echo "infra/api-image-tag.txt must hold sha-<40-character commit>, not '$tag'" >&2
  exit 1
fi

# The connection string comes from the shell if exported, otherwise from .env,
# read as data and never sourced (see terraform.sh). It is never printed.
DATABASE_URL="${PROD_DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ] && [ -f "$repo_dir/.env" ]; then
  DATABASE_URL="$(grep -m1 '^PROD_DATABASE_URL=' "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true)"
fi
if [ -z "$DATABASE_URL" ]; then
  echo "PROD_DATABASE_URL is not set and not in .env; see .env.example" >&2
  exit 1
fi
# Migrations hold a session-level lock, which Neon's pooler cannot keep.
if [[ "$DATABASE_URL" == *-pooler.* ]]; then
  echo "PROD_DATABASE_URL is the pooled connection; use the direct one (no -pooler)" >&2
  exit 1
fi
export DATABASE_URL

echo "Migrating the production database with $image_repo:$tag"
# --env DATABASE_URL passes the value by name, so it never appears on the
# docker command line. --pull always fetches the image afresh if the tag moved
# (it never should; tags are immutable by convention).
docker run --rm --pull always --env DATABASE_URL "$image_repo:$tag" migrate
