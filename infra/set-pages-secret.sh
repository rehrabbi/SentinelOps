#!/usr/bin/env bash
# Sets PROXY_SECRET on the Cloudflare Pages project (the proxy) to the value
# read from standard input, with wrangler, so the secret never appears on a
# command line or in output. It takes effect for the NEXT deployment: run the
# "Deploy frontend" workflow afterwards.
#
# This is the ONLY writer of the proxy's secret: Terraform sets it once, when
# it creates the project, and ignores it afterwards (infra/frontend.tf). On
# 2026-11-24 an apply of a new value through the Cloudflare provider stored a
# wrong one, which Terraform could not see because Cloudflare never returns
# secret values; the next deployment refused every API call. Targeting the
# Pages project in Terraform would also plan a Render update, which the free
# plan refuses (render-oss/terraform-provider-render#80).
#
# Usage:
#   <command that prints the new value> | infra/set-pages-secret.sh
#
# Needs Node.js (wrangler comes from frontend/node_modules, installed by
# npm ci), and CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.
set -euo pipefail

project="sentinelops"

if [ -t 0 ]; then
  echo "the new value must come from a pipe, not the keyboard" >&2
  exit 2
fi
value="$(cat)"
if [ -z "$value" ]; then
  echo "no value on standard input" >&2
  exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Read as data, never sourced (see terraform.sh), and exported only to wrangler.
env_value() { grep -m1 "^$1=" "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true; }
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$(env_value CLOUDFLARE_API_TOKEN)}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(env_value CLOUDFLARE_ACCOUNT_ID)}"
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "CLOUDFLARE_API_TOKEN is not set and not in .env" >&2; exit 1; }
[ -n "$CLOUDFLARE_ACCOUNT_ID" ] || { echo "CLOUDFLARE_ACCOUNT_ID is not set and not in .env" >&2; exit 1; }

cd "$repo_dir/frontend"
[ -x node_modules/.bin/wrangler ] || { echo "wrangler is missing: run npm ci in frontend/" >&2; exit 1; }

# The value reaches wrangler on standard input. Its output names the secret
# but never prints the value.
printf '%s' "$value" |
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
    node_modules/.bin/wrangler pages secret put PROXY_SECRET --project-name "$project" >/dev/null
echo "PROXY_SECRET updated on Pages project $project. Run the Deploy frontend workflow to use it."
