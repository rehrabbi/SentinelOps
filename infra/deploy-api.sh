#!/usr/bin/env bash
# Deploys the API image pinned in infra/api-image-tag.txt to Render, through
# Render's own API, then waits until the deploy is live and healthy.
#
# Why not `terraform apply`: render-oss/render 1.9.1 sends maintenance_mode on
# every update, which Render refuses for free-plan services, so any change to
# the API service fails (render-oss/terraform-provider-render#80, fix pending
# in #105). Creating it works, and Terraform still owns its definition; this
# script changes only the image. Delete it once a provider release has the fix.
#
# Order for a new API version: bump api-image-tag.txt, run infra/migrate.sh,
# then this script, then `infra/terraform.sh apply -refresh-only` to record the
# new image in Terraform's state (it only reads the providers; it changes
# nothing). `infra/terraform.sh plan` must then say "No changes".
#
# Usage, from anywhere in the repository:
#   infra/deploy-api.sh
set -euo pipefail

image_repo="ghcr.io/rehrabbi/sentinelops-api"
service_name="sentinelops-api"
api="https://api.render.com/v1"

infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$infra_dir")"

tag="$(tr -d '\r\n' <"$infra_dir/api-image-tag.txt")"
if ! [[ "$tag" =~ ^sha-[0-9a-f]{40}$ ]]; then
  echo "infra/api-image-tag.txt must hold sha-<40-character commit>, not '$tag'" >&2
  exit 1
fi
image="$image_repo:$tag"

# The key comes from the shell if exported, otherwise from .env, read as data
# and never sourced (see terraform.sh).
RENDER_API_KEY="${RENDER_API_KEY:-}"
if [ -z "$RENDER_API_KEY" ] && [ -f "$repo_dir/.env" ]; then
  RENDER_API_KEY="$(grep -m1 '^RENDER_API_KEY=' "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true)"
fi
if [ -z "$RENDER_API_KEY" ]; then
  echo "RENDER_API_KEY is not set and not in .env; see .env.example" >&2
  exit 1
fi

# Calls Render's API. The key reaches curl on stdin (-H @-), never on the
# command line, where other processes could read it.
render() {
  printf 'Authorization: Bearer %s\n' "$RENDER_API_KEY" |
    curl --silent --show-error --fail-with-body -H @- -H 'Accept: application/json' "$@"
}

# Exactly one service with this name, or stop: deploying to the wrong one would
# be worse than not deploying.
services="$(render "$api/services?name=$service_name&limit=20")"
ids="$(grep -oE '"id":"srv-[a-z0-9]+"' <<<"$services" | cut -d'"' -f4 || true)"
if [ "$(grep -c . <<<"$ids")" -ne 1 ]; then
  echo "expected exactly one Render service named $service_name, found: ${ids:-none}" >&2
  exit 1
fi
service_id="$ids"
url="$(grep -oE '"url":"https://[^"]+"' <<<"$services" | head -n1 | cut -d'"' -f4)"

echo "Deploying $image to $service_name ($service_id)"
deploy="$(render -X POST -H 'Content-Type: application/json' \
  -d "{\"imageUrl\":\"$image\"}" "$api/services/$service_id/deploys")"
deploy_id="$(grep -oE '"id":"dep-[a-z0-9]+"' <<<"$deploy" | head -n1 | cut -d'"' -f4)"
if [ -z "$deploy_id" ]; then
  echo "Render did not return a deploy id: $deploy" >&2
  exit 1
fi

# Render reports live only after the new instance passes its health check.
for _ in $(seq 1 60); do
  status="$(render "$api/services/$service_id/deploys/$deploy_id" |
    grep -oE '"status":"[a-z_]+"' | head -n1 | cut -d'"' -f4)"
  case "$status" in
    live)
      echo "Deploy $deploy_id is live"
      break
      ;;
    build_failed | update_failed | canceled | deactivated | pre_deploy_failed)
      echo "Deploy $deploy_id ended as $status; the previous version keeps serving" >&2
      exit 1
      ;;
  esac
  sleep 10
done
if [ "${status:-}" != "live" ]; then
  echo "Deploy $deploy_id still '$status' after 10 minutes; check the Render dashboard" >&2
  exit 1
fi

code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 60 "$url/healthz")"
echo "$url/healthz answered $code"
[ "$code" = "200" ]
