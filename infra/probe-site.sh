#!/usr/bin/env bash
# Fetches /api/healthz through the site once a second and reports every answer
# that is not 200, then a summary. Run it in a second terminal for the whole of
# a change that could interrupt the site, such as a PROXY_SECRET rotation:
# "0 not 200" is the proof the change refused nobody.
#
# The check needs the proxy secret, so it covers Cloudflare, the proxy, the
# secret, Render and the API, and it never touches the database.
#
# Usage:
#   infra/probe-site.sh [seconds]     default 1200 (20 minutes); Ctrl+C stops early
set -uo pipefail

url="https://sentinelops.pages.dev/api/healthz"
duration="${1:-1200}"
case "$duration" in
  '' | *[!0-9]*) echo "usage: $0 [seconds]" >&2; exit 2 ;;
esac

total=0
bad=0
summary() {
  echo "$total requests, $bad not 200"
  [ "$bad" -eq 0 ]
}
trap 'echo; summary; exit $?' INT TERM

echo "Probing $url every second for ${duration}s (Ctrl+C to stop)"
end=$((SECONDS + duration))
while [ "$SECONDS" -lt "$end" ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url")"
  total=$((total + 1))
  if [ "$code" != "200" ]; then
    bad=$((bad + 1))
    echo "$(date -u +%H:%M:%S) $code"
  fi
  sleep 1
done
summary
