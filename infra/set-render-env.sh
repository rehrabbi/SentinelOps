#!/usr/bin/env bash
# Sets one environment variable on the Render API service to the value read
# from standard input, through Render's API, so the secret never appears on a
# command line or in output. It does NOT restart the service: run
# infra/deploy-api.sh afterwards to roll the change out.
#
# Why not Terraform: render-oss/render 1.9.1 cannot update a free-plan service
# (render-oss/terraform-provider-render#80), so `terraform apply` cannot change
# these values. After rotating, `infra/terraform.sh apply -refresh-only`
# records the new value in state.
#
# Usage (see docs/RUNBOOK.md, "A secret leaked"):
#   <command that prints the new value> | infra/set-render-env.sh PROXY_SECRET
#   infra/set-render-env.sh --delete PROXY_SECRET_PREVIOUS
#
# Only the variables a rotation needs are allowed, and only the temporary
# PROXY_SECRET_PREVIOUS can be deleted. Never use Render's PUT /env-vars (no
# key) instead: it replaces the whole list.
set -euo pipefail

delete=false
if [ "${1:-}" = "--delete" ]; then
  delete=true
  shift
fi
name="${1:-}"
case "$delete:$name" in
  false:PROXY_SECRET | false:PROXY_SECRET_PREVIOUS | false:DATABASE_URL | true:PROXY_SECRET_PREVIOUS) ;;
  *)
    echo "usage: <value on stdin> | $0 PROXY_SECRET|PROXY_SECRET_PREVIOUS|DATABASE_URL" >&2
    echo "       $0 --delete PROXY_SECRET_PREVIOUS" >&2
    exit 2
    ;;
esac
if ! $delete; then
  if [ -t 0 ]; then
    echo "the new value must come from a pipe, not the keyboard" >&2
    exit 2
  fi
  value="$(cat)"
  if [ -z "$value" ]; then
    echo "no value on standard input" >&2
    exit 1
  fi
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RENDER_API_KEY="${RENDER_API_KEY:-}"
if [ -z "$RENDER_API_KEY" ] && [ -f "$repo_dir/.env" ]; then
  RENDER_API_KEY="$(grep -m1 '^RENDER_API_KEY=' "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true)"
fi
[ -n "$RENDER_API_KEY" ] || { echo "RENDER_API_KEY is not set and not in .env" >&2; exit 1; }

render() {
  printf 'Authorization: Bearer %s\n' "$RENDER_API_KEY" |
    curl --silent --show-error --fail-with-body -H @- -H 'Accept: application/json' "$@"
}

ids="$(render "https://api.render.com/v1/services?name=sentinelops-api&limit=20" |
  grep -oE '"id":"srv-[a-z0-9]+"' | cut -d'"' -f4 || true)"
if [ "$(grep -c . <<<"$ids")" -ne 1 ]; then
  echo "expected exactly one Render service named sentinelops-api, found: ${ids:-none}" >&2
  exit 1
fi

if $delete; then
  render -X DELETE "https://api.render.com/v1/services/$ids/env-vars/$name" >/dev/null
  echo "$name deleted on Render. Roll it out with infra/deploy-api.sh."
  exit 0
fi

# The JSON body is built by Python from the environment, so the value is
# escaped correctly and never passes through a command-line argument.
body="$(VALUE="$value" python -I -c 'import json, os; print(json.dumps({"value": os.environ["VALUE"]}))' 2>/dev/null ||
  VALUE="$value" python3 -I -c 'import json, os; print(json.dumps({"value": os.environ["VALUE"]}))')"
render -X PUT -H 'Content-Type: application/json' --data-binary @- \
  "https://api.render.com/v1/services/$ids/env-vars/$name" <<<"$body" >/dev/null
echo "$name updated on Render. Roll it out with infra/deploy-api.sh."
