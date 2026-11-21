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

# The state backend's connection string. One already exported in the shell wins;
# otherwise it is read out of .env as data. Sourcing .env would run it as shell
# code, and the & in a connection string would silently background the
# assignment, leaving PG_CONN_STR empty.
if [ -z "${PG_CONN_STR:-}" ] && [ -f "$repo_dir/.env" ]; then
  PG_CONN_STR="$(grep -m1 '^PG_CONN_STR=' "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true)"
fi
if [ -z "${PG_CONN_STR:-}" ]; then
  echo "PG_CONN_STR is not set and not in .env; see .env.example" >&2
  exit 1
fi
export PG_CONN_STR

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

# Secrets are passed by name only (-e NAME), so their values never appear on the
# docker command line, where other processes could read them. A name that is
# not set on the host is simply not passed. The plugin cache volume keeps
# downloaded providers between runs; each is still checked against the lock file.
exec docker run --rm "${tty_flags[@]}" \
  --volume "$mount_dir:/infra" \
  --workdir /infra \
  --volume sentinelops-terraform-plugins:/plugin-cache \
  --env TF_PLUGIN_CACHE_DIR=/plugin-cache \
  --env PG_CONN_STR \
  --env CLOUDFLARE_API_TOKEN \
  --env RENDER_API_KEY \
  --env RENDER_OWNER_ID \
  --env NEON_API_KEY \
  "$terraform_image" "$@"
