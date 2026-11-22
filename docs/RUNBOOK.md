# Runbook

What to do when something goes wrong in production. Each entry follows one shape: **symptom →
first checks → fix → confirm → record**. Commands are for Git Bash in the repository root on
Windows (they also work on macOS); `.env` must hold the values listed in `.env.example`.

Write down what you did as you go: a GitHub issue labelled `priority: high` is the incident log.

## Where things are

| Thing | Where |
|---|---|
| Site | `https://sentinelops.pages.dev` (Cloudflare Pages project `sentinelops`) |
| API | Render service `sentinelops-api`, `https://sentinelops-api-a61s.onrender.com` (direct calls get 403 except `/healthz`) |
| Database | Neon project `sentinelops` in the *SentinelOps App* organisation, Singapore |
| Terraform state | Neon project `sentinelops-tfstate` in its own organisation (`PG_CONN_STR`) |
| API logs | Render dashboard → `sentinelops-api` → Logs; one JSON line per request, searchable by `request_id` (returned to callers as `X-Request-ID`) |
| Uptime alerts | UptimeRobot (owner's account): the site and `/api/healthz` through the proxy, every 5 minutes, by email |
| Scheduled checks | GitHub Actions: **Audit verify** (every 6 hours), **Backup** (02:47 UTC daily); a failed scheduled run emails the owner |
| Audit anchors | branch `audit-anchors`, file `anchors.log` (protected: no force-push, no deletion) |
| Backups | GitHub Actions artifacts `sentinelops-db-<UTC time>`, 90 days, encrypted with `age` |
| Backup private key | owner's password manager, and `~/.sentinelops/backup-key.txt` on the machine that restores |

---

## 1. Audit verify failed

**Symptom:** an email that the scheduled **Audit verify** run failed.

This is the serious one: it can mean someone with database access rewrote the audit history.
Treat it as a security incident until proven otherwise.

**Do not:** delete or edit anything in `audit_log`, re-run anything that writes to the database
beyond what is listed here, add an anchor to make the check pass, or touch the `audit-anchors`
branch. Every one of those destroys evidence.

**First checks**, in the failed run's log (Actions → Audit verify → the run → *Verify against the
last anchor*):

| The log says | Meaning |
|---|---|
| `could not read the chain head` or `the anchor was not confirmed` | The pinned image is too old for `--anchor`, or the output changed. Not tampering: check `infra/api-image-tag.txt` against what is deployed. |
| `audit chain BROKEN: … first bad id N` | A stored row no longer matches its hash: **someone edited entry N or later.** |
| `audit chain BROKEN: … entry N no longer exists` or `… has hash X, anchored Y` | The chain verifies on its own but is not the chain GitHub witnessed: **it was rebuilt or rolled back.** Also expected after a deliberate restore (see 3) if no new anchor was recorded. |
| A connection or authentication error | Not tampering. Neon is down, or `AUDIT_DATABASE_URL` is wrong (see 5). Re-run the workflow. |

**If it looks like tampering:**
1. **Preserve evidence now.** Download every backup artifact before any expires (they last 90 days):
   `gh run list --workflow backup.yml -L 100` and `gh run download <run-id>` for each. Export the
   current table (Postgres's own client, in a container):
   ```bash
   export DATABASE_URL="$(grep -m1 '^PROD_DATABASE_URL=' .env | cut -d= -f2- | tr -d '\r')"
   MSYS_NO_PATHCONV=1 docker run --rm --env DATABASE_URL postgres:17-alpine \
     sh -c 'psql "$DATABASE_URL" -c "\copy audit_log to stdout csv header"' > audit_log-now.csv
   ```
2. **Find the last good state.** Run `infra/restore-drill.sh` against backups from newest to oldest
   (download one, then `--file`); the newest whose drill passes against the anchors holds the
   untampered history. Compare it with the export to see exactly which rows changed.
3. **Assume the owner database login leaked.** Rotate it (section 5, `DATABASE_URL`), then review
   who can reach Neon: the Neon organisation's members and API keys.
4. Record the finding, the evidence kept, and the rotation in the incident issue.

**Confirm:** after a legitimate cause is fixed, run **Audit verify** by hand (Actions → Audit
verify → Run workflow) and check it passes with `anchor … still holds`.

---

## 2. Backup failed

**Symptom:** an email that the scheduled **Backup** run failed.

**First checks**, in the failed run's log:

| The log says | Fix |
|---|---|
| `infra/backup-recipient.txt does not hold an age public key` | Someone changed the file; restore the owner's public key (`# public key:` line of the key file). |
| `password authentication failed for user "backup_reader"` | The password was rotated without updating the secret: `infra/rotate-readonly-role.sh backup_reader`. |
| `the encrypted dump is only N bytes` | The dump came out (nearly) empty: check the log above it for a `pg_dump` error. |
| A connection error or timeout | Neon is down or waking slowly: check [Neon's status page](https://neonstatus.com) and re-run. |

**Confirm:** run **Backup** by hand, then `infra/restore-drill.sh`, which must end in
`RESTORE DRILL PASSED`. A backup that has not been restored is not yet a backup.

**Routine:** run the restore drill at least once a month even when nothing failed, and after any
change to the schema, the backup workflow, or the key.

---

## 3. Restore data

Choose the smallest restore that fixes the problem.

### A. Lost or damaged data within the last 6 hours

Neon's Free plan keeps a 6-hour restore window. In the Neon console: the *SentinelOps App*
organisation → project `sentinelops` → the `main` branch → restore it to a time before the damage.
Nothing else changes: same connection string, same roles.

### B. Older than 6 hours, or Neon's own history is gone

1. Pick the backup: the newest one from before the damage. Prove it first:
   `infra/restore-drill.sh --file <downloaded sentinelops.dump.age>` must pass.
2. Create a new, empty database in the Neon project (console → Databases → New database, owner
   `sentinelops`), for example `sentinelops_restored`, and copy its direct (non-pooled) connection
   string into `.env` as `RESTORE_URL` (never into chat or git).
3. Restore into it. The key and the decrypted data stay inside the container:
   ```bash
   RESTORE_URL="$(grep -m1 '^RESTORE_URL=' .env | cut -d= -f2- | tr -d '\r')"; export RESTORE_URL
   MSYS_NO_PATHCONV=1 docker run --rm --env RESTORE_URL \
     -v "$(cygpath -w "$HOME/.sentinelops"):/key:ro" -v "$(cygpath -w "$PWD"):/backup:ro" \
     postgres:17-alpine sh -c 'apk add -q age && age -d -i /key/backup-key.txt /backup/sentinelops.dump.age \
       | pg_restore --no-owner --no-privileges --exit-on-error -d "$RESTORE_URL"'
   ```
4. Let the read-only roles read it (roles belong to the Neon branch, permissions to the database):
   run the four `GRANT` lines and the two `ALTER DEFAULT PRIVILEGES` lines from
   `infra/sql/backup-reader.sql`, and the three `GRANT` lines from `infra/sql/audit-verifier.sql`,
   with `sentinelops` replaced by the new database's name.
5. Point production at it: set `PROD_DATABASE_URL` in `.env` to `RESTORE_URL`'s value, then
   `grep -m1 '^PROD_DATABASE_URL=' .env | cut -d= -f2- | tr -d '\r\n' | infra/set-render-env.sh DATABASE_URL`,
   `infra/migrate.sh` (brings an older backup's schema forward), `infra/deploy-api.sh`, and
   `infra/terraform.sh apply -refresh-only`.
6. Point the scheduled jobs at it: `infra/rotate-readonly-role.sh audit_verifier` and
   `infra/rotate-readonly-role.sh backup_reader` (they build their URLs from `PROD_DATABASE_URL`).
7. **Record the restore in the anchor log.** The restored chain is older than the newest anchor, so
   Audit verify will now fail with "entry N no longer exists". That is the honest result, not a
   bug: append a comment line and a new anchor by hand, in a normal commit (never a force-push):
   ```
   # <UTC time> restored from <artifact name> after <incident>; entries <a>..<b> were lost
   <UTC time> <head id>:<head hash>      # from: infra/restore-drill.sh output, "head …"
   ```
8. **Confirm:** the site works, **Audit verify** and **Backup** pass when run by hand, and the
   drill passes against the next backup.

### C. Everything is gone (account loss, full rebuild)

Rebuild with Terraform using the first bring-up order in `docs/PROJECT-STATE.md` §6, but at the
step that runs `infra/migrate.sh` on an empty database, restore the newest backup instead (B, steps
3–4), then continue. Recreate the read-only roles with the two SQL files and the `audit` and
`backup` GitHub environments as recorded in §6, and record the rebuild in the anchor log (B, step 7).

---

## 4. Site or API down

**Symptom:** an UptimeRobot email that a monitor is down.

| Down | Look at |
|---|---|
| Only `/api/healthz` | Render (dashboard → `sentinelops-api` → Events and Logs; [Render status](https://status.render.com)). A 403 there means the proxy and the API disagree on `PROXY_SECRET`, or the site's `API_ORIGIN` is wrong. |
| The site too | Cloudflare ([status](https://www.cloudflarestatus.com)); Pages → `sentinelops` → Deployments (did the last deploy fail?). |
| Neither, but users report errors | API logs: search for `"status":5` or for the `request_id` a user quotes. A database problem shows as errors on real routes while `/api/healthz` stays up (it never touches the database); check [Neon status](https://neonstatus.com). |

**Roll back a bad release:**
- API: put the previous tag back in `infra/api-image-tag.txt` (git history has it), then
  `infra/deploy-api.sh` and `infra/terraform.sh apply -refresh-only`. If the bad release ran a
  migration, check its down migration before rolling the schema back; usually leaving the newer
  schema in place is safer.
- Site: Cloudflare dashboard → Pages → `sentinelops` → Deployments → an earlier production
  deployment → *Rollback to this deployment*.

**Confirm:** both monitors are Up in UptimeRobot, and the site works when logged in.

---

## 5. A secret leaked

Rotate the leaked one first, then check the logs and the audit trail for use of it.

| Secret | Steps |
|---|---|
| `audit_verifier` or `backup_reader` password (GitHub environment `audit` / `backup`) | `infra/rotate-readonly-role.sh audit_verifier` (or `backup_reader`), then run **Audit verify** (or **Backup**) by hand. *Exercised on 2026-11-22.* |
| Owner database login (`PROD_DATABASE_URL`, Render's `DATABASE_URL`) | Neon console → project `sentinelops` → Roles → `sentinelops` → reset password; copy the new direct connection string into `.env` as `PROD_DATABASE_URL`. Then `grep -m1 '^PROD_DATABASE_URL=' .env \| cut -d= -f2- \| tr -d '\r\n' \| infra/set-render-env.sh DATABASE_URL`, `infra/deploy-api.sh`, `infra/terraform.sh apply -refresh-only`. |
| `PROXY_SECRET` | See below. Expect about a minute of 403s through the site. |
| Cloudflare token for CI (environment `production`) | Cloudflare → My Profile → API tokens → roll or delete `sentinelops-github-deploy`, create a new one with the same scope (Cloudflare Pages: Edit, one account, an expiry), copy it, then `powershell -NoProfile -Command "Get-Clipboard" \| gh secret set CLOUDFLARE_API_TOKEN --env production --repo rehrabbi/SentinelOps` and clear the clipboard. Run **Deploy frontend** to confirm. |
| Provider keys in `.env` (`RENDER_API_KEY`, `CLOUDFLARE_API_TOKEN`, `NEON_API_KEY`, `PG_CONN_STR`) | Roll the key in that provider's dashboard with the same scope, update `.env` on every device, and confirm with `infra/terraform.sh plan` ("No changes"). |
| Backup private key | Move the old key file aside (keep it until its backups expire), then generate a new pair straight into the file without printing it: `docker run --rm alpine:3.20 sh -c "apk add -q age >/dev/null && age-keygen 2>/dev/null" > ~/.sentinelops/backup-key.txt`. Save the file in the password manager, put its `# public key:` line's key in `infra/backup-recipient.txt` by pull request, then run **Backup** and the drill with the new key. Backups made with the old key stay readable by whoever has it until they expire (90 days); delete those artifacts if that matters. |

**Rotating `PROXY_SECRET`** (not yet exercised live). The API accepts one secret at a time, and
Render's Terraform provider cannot update the service, so the order matters:
1. Replace only the secret in Terraform's state:
   `infra/terraform.sh apply -replace=random_password.proxy_secret -target=random_password.proxy_secret`.
   The plan must replace exactly that one resource.
2. Give it to the API (the value goes from the state straight into the pipe):
   ```bash
   infra/terraform.sh state pull \
     | python -I -c "import json,sys; s=json.load(sys.stdin); print(next(r['instances'][0]['attributes']['result'] for r in s['resources'] if r['type']=='random_password'), end='')" \
     | infra/set-render-env.sh PROXY_SECRET
   infra/deploy-api.sh
   ```
   From here until step 4, requests through the site get 403.
3. Give it to the proxy: `infra/terraform.sh apply -target=cloudflare_pages_project.web`. The plan
   must change only the Pages project (Render already has the new value, so it shows no change there).
4. Run **Deploy frontend** by hand so the proxy function picks up the new value.
5. Confirm: `/api/healthz` through the site answers 200, and `infra/terraform.sh plan` says
   "No changes".

---

## 6. Someone is locked out, or an account may be compromised

| Situation | Steps |
|---|---|
| A user forgot their password | An admin opens **Users**, presses **Reset password** on that row, and sends the link to that person only, over a channel other than the site itself. It works once, for 1 hour, and a new one replaces it. Using it logs that account out everywhere. |
| A session may be stolen (a lost device, an unfamiliar login in the audit log) | The user opens **Account security** and changes their password, which ends every other session, or presses **Log out everywhere**. If the user cannot log in, an admin issues a reset link, which ends all of their sessions when used. |
| An admin forgot their password | Another admin issues them a reset link: nobody can reset their own account. If they are the only admin, there is no in-app path; it needs direct database access with the owner login. |

**Confirm:** the audit log shows `user.password_reset`, `user.password_changed` or `user.logout_all`
for that account, with the number of sessions ended:

```sql
SELECT occurred_at, actor_email, action, outcome, detail
FROM audit_log
WHERE action IN ('user.password_changed', 'user.password_reset', 'user.password_reset_issued', 'user.logout_all')
ORDER BY id DESC LIMIT 20;
```
