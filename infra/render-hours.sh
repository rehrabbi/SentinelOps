#!/usr/bin/env bash
# Warns before Render's free instance hours can run out. Every free web service
# in the workspace draws on one allowance of 750 hours a calendar month; when it
# is spent, Render suspends ALL free services, production included, until the
# 1st. Uptime monitoring keeps the API awake, so it alone uses up to 744 hours
# (24 x 31): a second free service that stays awake is enough to run out.
#
# Render's API does not report hours used, so this projects the worst case:
# every free web service that is not suspended, awake all month. It fails
# (exit 1) when that exceeds 750, or when the API itself is suspended.
#
# Usage, locally or in CI (.github/workflows/render-hours.yml):
#   infra/render-hours.sh
# Reads RENDER_API_KEY from the environment, or from .env.
set -euo pipefail

allowance=750
api_service="sentinelops-api"

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RENDER_API_KEY="${RENDER_API_KEY:-}"
if [ -z "$RENDER_API_KEY" ] && [ -f "$repo_dir/.env" ]; then
  RENDER_API_KEY="$(grep -m1 '^RENDER_API_KEY=' "$repo_dir/.env" | cut -d= -f2- | tr -d '\r' || true)"
fi
[ -n "$RENDER_API_KEY" ] || { echo "RENDER_API_KEY is not set and not in .env" >&2; exit 1; }

services="$(printf 'Authorization: Bearer %s\n' "$RENDER_API_KEY" |
  curl --silent --show-error --fail-with-body -H @- -H 'Accept: application/json' \
    "https://api.render.com/v1/services?limit=100")"

# Whichever Python actually runs: on Windows, python3 can be a Store shortcut.
py=python3
"$py" -c "" >/dev/null 2>&1 || py=python
SERVICES="$services" ALLOWANCE="$allowance" API_SERVICE="$api_service" "$py" -I -c '
import calendar, datetime, json, os, sys

allowance = int(os.environ["ALLOWANCE"])
today = datetime.datetime.now(datetime.timezone.utc)
month_hours = 24 * calendar.monthrange(today.year, today.month)[1]

rows, awake, api_suspended = [], 0, None
for item in json.loads(os.environ["SERVICES"]):
    s = item["service"]
    plan = s.get("serviceDetails", {}).get("plan")
    if s.get("type") != "web_service" or plan != "free":
        continue
    suspended = s.get("suspended") != "not_suspended"
    if s["name"] == os.environ["API_SERVICE"]:
        api_suspended = suspended
    if not suspended:
        awake += 1
    rows.append("| %s | %s |" % (s["name"], "suspended" if suspended else "running"))

projected = awake * month_hours
lines = [
    "## Render free hours",
    "",
    "| Free web service | State |",
    "|---|---|",
    *rows,
    "",
    "Worst case this month: %d running x %d hours = **%d of %d** free hours." % (awake, month_hours, projected, allowance),
]
problems = []
if api_suspended is None:
    problems.append("the API service was not found among the free web services")
elif api_suspended:
    problems.append("the API is suspended: the free hours may already be spent, or it was suspended by hand")
if projected > allowance:
    problems.append("%d free services could use %d hours, more than the %d free: suspend or delete the extra ones, or Render will suspend every free service, production included, when the hours run out" % (awake, projected, allowance))
lines += ["", ("**Problem:** " + "; ".join(problems)) if problems else "**OK.**"]
text = "\n".join(lines)
print(text)
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a", encoding="utf-8") as f:
        f.write(text + "\n")
sys.exit(1 if problems else 0)
'
