#!/usr/bin/env bash
# Runs Terraform from HashiCorp's official container image instead of a local
# install, so every machine and CI use the same version, and nothing on the host
# can get between Terraform and its providers. (On one Windows machine,
# antivirus HTTPS scanning intercepted the local TLS connection Terraform makes
# to each provider, and every command failed.)
#
# Usage, from anywhere in the repository:
#   infra/terraform.sh init
#   infra/terraform.sh plan
set -euo pipefail

terraform_image="hashicorp/terraform:1.17.2"

infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$infra_dir")"

# Reads one NAME=value line out of .env as data and prints the value. Sourcing
# .env would run it as shell code, and the & in a connection string would
# silently background the assignment, leaving the variable empty.
env_file_value() {
  [ -f "$repo_dir/.env" ] || return 0
  grep -m1 "^$1=" "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true
}

# Each setting is taken from the shell if already exported there, otherwise from
# .env. Provider credentials keep their own names; Terraform inputs are renamed
# to TF_VAR_<input>, which is how Terraform receives variables from outside.
#   .env name               passed to Terraform as
settings=(
  "PG_CONN_STR            PG_CONN_STR"
  "CLOUDFLARE_API_TOKEN   CLOUDFLARE_API_TOKEN"
  "RENDER_API_KEY         RENDER_API_KEY"
  "RENDER_OWNER_ID        RENDER_OWNER_ID"
  "NEON_API_KEY           NEON_API_KEY"
  "NEON_ORG_ID            TF_VAR_neon_org_id"
  "CLOUDFLARE_ACCOUNT_ID  TF_VAR_cloudflare_account_id"
  "PROD_DATABASE_URL      TF_VAR_prod_database_url"
)
env_flags=()
for setting in "${settings[@]}"; do
  read -r source_name target_name <<<"$setting"
  value="${!source_name:-}"
  [ -n "$value" ] || value="$(env_file_value "$source_name")"
  if [ -n "$value" ]; then
    export "$target_name=$value"
    env_flags+=(--env "$target_name")
  fi
done

# Without the state connection nothing works, so stop early with a clear reason.
if [ -z "${PG_CONN_STR:-}" ]; then
  echo "PG_CONN_STR is not set and not in .env; see .env.example" >&2
  exit 1
fi

# Git Bash on Windows rewrites anything that looks like a path, including the
# container-side paths below. Hand Docker a Windows path and turn that off.
mount_dir="$infra_dir"
if command -v cygpath >/dev/null 2>&1; then
  mount_dir="$(cygpath -w "$infra_dir")"
  export MSYS_NO_PATHCONV=1
fi

# Interactive commands such as apply need a terminal for their confirmation.
tty_flags=(-i)
if [ -t 0 ] && [ -t 1 ]; then
  tty_flags=(-it)
fi

# Secrets are passed by name only (--env NAME), so their values never appear on
# the docker command line, where other processes could read them. A setting
# that is empty everywhere is simply not passed. The plugin cache volume keeps
# downloaded providers between runs; each is still checked against the lock file.
exec docker run --rm "${tty_flags[@]}" \
  --volume "$mount_dir:/infra" \
  --workdir /infra \
  --volume sentinelops-terraform-plugins:/plugin-cache \
  --env TF_PLUGIN_CACHE_DIR=/plugin-cache \
  "${env_flags[@]}" \
  "$terraform_image" "$@"
