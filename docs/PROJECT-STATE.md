# Project State — Resume Here

> **Snapshot for continuing on any device.** Read `docs/WAYS-OF-WORKING.md` first (how
> we collaborate), then this file (where we are + what's next). `docs/learning-log.md`
> has the blow-by-blow history.
>
> **Last updated:** 2026-11-22 · **Current release:** ✅ **v0.4.0, free cloud deployment**, live at
> https://sentinelops.pages.dev, with all nine checks required. Next: plan the next stage. Full
> detail in §6.

---

## 1. How to resume on a new device

1. Clone the repo and open the folder in VSCode. Run `git fetch origin` and
   `git branch -r --no-merged main`: any branch it prints is unfinished work to check out first,
   except `audit-anchors`, the permanent audit-anchor data branch, which never merges.
2. Tell Claude: *"Read docs/WAYS-OF-WORKING.md and docs/PROJECT-STATE.md, then re-orient
   per the Session behavior section and continue."* (Re-paste the operating manual too if
   you have it — but WAYS-OF-WORKING.md captures all of it.)
3. Claude should summarize state, confirm the next step below, and wait for your go-ahead.
4. **Prerequisites on the new device:** a container runtime, Go 1.26+, Node.js + npm, git.
   Recreate the git-ignored root `.env` (see `.env.example`) — it holds the Postgres
   credentials (never committed). Platform-specific setup is in §9.

> **Note:** Claude's saved "memory" is per-device and does NOT travel. All rules/prefs
> are captured in `docs/WAYS-OF-WORKING.md` instead — that file is authoritative.

---

## 2. What SentinelOps is

A production-style, cloud-native SaaS: a **secure incident & ticket management
platform**. The learning objective is the **engineering around the app** (security,
cloud, DevSecOps, IaC, observability), not just CRUD. Target architecture: CDN/WAF →
LB → Dockerized frontend+backend → Postgres/RDS, with a GitHub Actions CI/CD pipeline
(tests, SAST, dependency/secret/container scanning, Docker build, deploy) provisioning
AWS via Terraform. Everything must be **free**.

---

## 3. Locked stack decisions (all free)

| Area | Decision | Notes |
|---|---|---|
| Backend language | **Go** (stdlib `net/http`, no web framework) | Chose Go over "TS everywhere" for cloud-native depth |
| DB access | **`database/sql` + pgx driver**, hand-written SQL, **no ORM** | Learn SQL directly |
| Frontend | **React + Vite + TypeScript** | react-ts template |
| Database | **PostgreSQL 17** in Docker | localhost-only bind |
| Repo | **Monorepo** (`backend/`, `frontend/`, `docs/`), **public** GitHub | keep real email in commits; repo is public, so treat everything pushed as visible to anyone |
| Migrations | **golang-migrate** (as a library, `go:embed` SQL) | explicit `migrate` subcommand |
| Config | 12-factor env vars; git-ignored `.env` + committed `.env.example` | secrets never committed |

---

## 4. Decisions made per stage (chronological)

**Database / users table (migration 000001):** UUID PK (`gen_random_uuid()`),
`timestamptz` timestamps, case-insensitive unique email via `UNIQUE INDEX on
lower(email)`, `password_hash` column, NOT NULL constraints.

**Backend layering:** by-feature packages under `internal/` (Go `internal/` = importable
only within this module). Each domain = model + repository (SQL) + handler (HTTP), wired
by **manual dependency injection** in `main.go`.

**Users read API (`GET /api/users`):** repository omits `password_hash`; `User.PasswordHash`
has `json:"-"`; handler logs real errors but returns generic messages.

**Users write API (`POST /api/users`) — registration:**
- Password hashing: **bcrypt** (`golang.org/x/crypto/bcrypt`, cost = DefaultCost/10).
- Validation: **in `internal/user/validate.go`** — valid email (`net/mail`), password
  **min 12 chars, no composition rules** (NIST 800-63B, length > symbols), max 72 bytes.
- Duplicate email: **trust the DB** — INSERT and catch Postgres `23505` → sentinel
  `ErrEmailTaken` → `409` (atomic; avoids TOCTOU race).
- Strict JSON parse: `MaxBytesReader` (1 MiB) + `DisallowUnknownFields` (mass-assignment
  defense) + reject trailing data. Success = `201 Created` + `Location`.

**Authentication — login (complete):**
- Strategy: **server-side sessions** (opaque token in an HttpOnly cookie, session row in
  Postgres) — over JWT / managed provider. Instant revocation; teaches secure cookies + CSRF.
- Token at rest: store **SHA-256 hash** of the token only (fast SHA-256 is fine — token
  is 256-bit random; bcrypt is only for guessable passwords).
- Session lifetime: **7-day absolute expiry**.
- Sessions table (migration 000002): `token_hash` PK, `user_id` FK `ON DELETE CASCADE`,
  `created_at`, `expires_at`; indexes on `user_id` and `expires_at`.
- Login route: **RESTful `POST /api/sessions`** (logout later = `DELETE
  /api/sessions/current`).
- Cookie: `SameSite=Lax` (CSRF defense), `HttpOnly`, `Secure` (env-driven; off for local
  http), 7-day expiry.
- Package structure: **`internal/session`** (data) + **`internal/auth`** (login/logout
  handlers + upcoming middleware). `auth` depends on BOTH `user` and `session`, which is
  exactly why it is its own package — putting login inside either domain would weld the
  two together and risk an import cycle.
- Timing defense: on an unknown email, run a bcrypt compare against a **precomputed dummy
  hash** so "no such user" costs the same as "wrong password" (blocks user enumeration by
  response time). Both paths return an identical `401 invalid email or password`.

**Config & CORS decisions (Step 5):**
- `SECURE_COOKIES` — dedicated boolean env var, **default false** (local dev is plain
  http, where a `Secure` cookie would be silently dropped). Production MUST set it true.
  Chosen over deriving it from an `APP_ENV` because the link from var to behavior is direct.
- `FRONTEND_ORIGIN` — env var, defaults to `http://localhost:5173`. Replaces the hardcoded
  `allowedOrigin` const; matters more now that credentialed CORS is on.
- `Access-Control-Allow-Credentials: true` — required for the browser to store/send the
  session cookie cross-origin (`:5173` → `:8080`). **Never combine with `*`** — browsers
  forbid it, because it would let any site call the API with the victim's cookie.
- **OPTIONS preflight handled in `withCORS`**, returning 204 with `Allow-Methods`,
  `Allow-Headers`, `Max-Age`. Fixed a latent bug: `mux.HandleFunc("POST /api/...")` matches
  only POST, so preflight fell through to 405 and *any* browser JSON POST would have failed
  — including the existing registration endpoint. curl never revealed it (curl doesn't
  preflight; only browsers do).

---

**Repo presentation decisions (2026-10-20):** licence is **MIT** (permissive, portfolio
default). The README is rebuilt for a **recruiter-first skim**, leading with a screenshot,
badges, a Mermaid architecture diagram, a threat-to-control security table, and an honest
"Known gaps" section. Community health files added (`LICENSE`, `SECURITY.md`,
`CONTRIBUTING.md`, PR and issue templates). CI is a **build-and-vet workflow only**
(gofmt, vet, build, test for Go; lint and type-check for the frontend), with security
scanning deliberately deferred to its own stage so it gets taught rather than bolted on.
**Branching stays GitHub Flow** as locked in WAYS-OF-WORKING §13, now documented in
`CONTRIBUTING.md`. **`dev`/`staging`/`prod` environment branches are a decided future step**,
to be created only once there is real infrastructure to deploy to (after Docker, CI, and AWS).

**Repo standards decisions (2026-10-24):** branches are **typed** to mirror commit types
(`feat/ fix/ docs/ build/ ci/ refactor/ chore/`), with no issue number in the name. Features,
fixes, and stages start as an **issue** that the PR closes; small docs/chore changes may skip it.
The repo allows **merge commits only** (squash and rebase disabled in GitHub settings), and the
merge commit uses the **PR title and description** as its message, so PR write-ups live in
`git log`. **Auto-merge** was enabled on 2026-11-21 (owner-approved settings change): PRs are
set to merge themselves once all required checks pass, and branches are archived afterwards. Merge commits were chosen because they keep commit hashes valid on `main`, which the
docs cite. The PR template gained a linked issue, type of change, risk and rollback, and
screenshots. **Nine jobs are required checks** on `main` (the two `ci.yml` jobs, plus the six
`security.yml` jobs added in CI hardening, approved 2026-11-21, plus `Infrastructure (Terraform)`
from `ci.yml`, approved 2026-11-22), reported by GitHub Actions only
(app id 15368) and with branches required to be up to date before merging; the rule lives in the
classic branch protection alongside the existing PR, admin, and conversation rules.
Routine commits, pushes, PRs, and merges on green CI are **pre-approved** (see WAYS-OF-WORKING
§11). Labels are prefixed `type:` (mirrors branch and commit types), `area:` and `priority:`,
replacing GitHub's defaults except `duplicate`, `wontfix` and `question`. Milestones are one per
roadmap stage, created when the stage starts, each ending in a release; milestone #1 is
**Containerization**, and the 16 PRs merged before issue tracking were deliberately not
backfilled. `.github/CODEOWNERS` is `* @rehrabbi`, informational only (code owner review is not
required, since an author cannot approve their own PR). `CODE_OF_CONDUCT.md` is GitHub's
Contributor Covenant 2.0 template, with bernardojirehrabbi@gmail.com as the report contact.
**Releases:** semantic versioning, with today's `main` as **`v0.1.0`** (everything up to the
repo standards), each roadmap stage ending in the next minor release (Containerization →
`v0.2.0`), patch releases for fixes between stages, and **`1.0.0` reserved for the first
hardened production deployment** (first written as "on AWS"; AWS was dropped in v0.4.0). `CHANGELOG.md` is hand-written in Keep a Changelog
format; every user-visible or security-relevant PR adds a line under `Unreleased`. Tags are
annotated, never moved, and every release is confirmed by the owner before tagging (an
approval gate in WAYS-OF-WORKING §11).
The README now carries a release badge and status line, describes this workflow, and makes
no claim about how the code was produced; the repo homepage points at the latest release.
The repo standards work is complete.

## 5. What's built and working

**Endpoints live:** `GET /healthz` (liveness), `GET /readyz` (DB readiness),
`GET /api/users` (list), `POST /api/users` (register — tested 6/6: 201, dup→409,
short pw→400, bad email→400, unknown field→400, DB shows real `$2a$10$…` bcrypt hash),
**`POST /api/sessions` (login)**, **`GET /api/me`** (current user — protected; tested 7/7),
**`DELETE /api/sessions/current`** (logout — tested 6/6),
**`POST /api/incidents`** (create), **`GET /api/incidents`** (list, RBAC-scoped),
**`GET /api/incidents/{id}`** + **`PATCH /api/incidents/{id}`** (detail + partial update,
per-object authz) — all behind `RequireAuth` (see the learning log).

**Login test results (8/8 passing):** 200 + `Set-Cookie` on valid credentials; 401 on wrong
password; 401 **byte-identical** on unknown email; 400 on unknown JSON field; `OPTIONS`
preflight → 204 with full CORS headers; session row present with a 64-char hash and 7-day
expiry. Cookie observed as `Path=/; Max-Age=604800; HttpOnly; SameSite=Lax` (no `Secure`,
correct for local http). Three security properties verified rather than assumed:
1. No bcrypt hash in the login response body (`json:"-"` holds, on a struct that *did* carry it).
2. Timing indistinguishable — unknown email **51.0ms** vs wrong password **52.0ms** over 5
   runs each (the ~50ms *is* bcrypt cost 10; without the dummy hash the miss would be ~1ms).
3. DB stores `sha256(raw token)`, never the raw token — confirmed by hashing the returned
   cookie locally and comparing. Note both values are 64 hex chars, so length proves nothing.

**Frontend auth UI (verified in-browser):** initial load → session check shows the login form;
valid login → logged-in view; logout → back to the form; **reload while logged in → still
logged in** (cookie persists). No `password_hash` reaches the client, and the HttpOnly cookie
is never read by JS — auth state comes from `GET /api/me`. **Registration UI also verified:**
new signup → auto-login → logged-in view; duplicate email → "email already registered" shown;
logout → returns to the login view.

**Incident domain + RBAC (verified live):** reporters see only their own incidents; an analyst
sees all (role read fresh from the DB each request, so it cannot be forged client-side); create
sets the owner from the authenticated user and always starts `status=open`; unauthenticated →
401; forged `userId`/`status`, invalid `severity`, or empty `title` → 400. The `WHERE user_id =
$1` scoping is the concrete IDOR / broken-access-control defense.

**Incident dashboard (verified in-browser):** login → the logged-in view lists your incidents
with colored severity/status badges; the create form prepends the new incident (`status=open`).
RBAC demo: as a reporter, uitest saw 1 (their own); after `UPDATE users SET role='analyst'` +
reload, the **same account** saw all 3 — no re-login, since the role is read fresh each request.

**Incident detail + update (verified 12/12 + in-browser):** `GET`/`PATCH /api/incidents/{id}`
with **per-object authz** — a reporter gets **404 (not 403)** for another user's incident (no
existence leak); analysts read/update any; partial PATCH (only sent fields change); invalid
status/severity, empty body, or unknown field → 400. In the UI, each row's **status dropdown**
PATCHes on change and persists across reload. Access is proven by an owner/role-scoped read
*before* any write. A **malformed (non-UUID) id → 404** too — the handler checks the id's shape
before it reaches Postgres, so bad input never surfaces as a 500. (GET was built on the other
device; PATCH was rebased on top of it — see the learning log's git lesson.)

**Files:**
- `backend/main.go` — routes + CORS middleware + `migrate` subcommand + manual DI.
- `backend/db.go` — `openDB` (sql.Open + pgx, pool tuning).
- `backend/migrate.go` — `go:embed` migrations, `runMigrateUp`.
- `backend/migrations/000001_create_users.{up,down}.sql`
- `backend/migrations/000002_create_sessions.{up,down}.sql`
- `backend/migrations/000003_add_user_role.{up,down}.sql` — RBAC `role` column (CHECK:
  reporter/analyst/admin, default reporter)
- `backend/migrations/000004_create_incidents.{up,down}.sql` (all applied; schema_migrations=4)
- `backend/internal/user/{user.go, repository.go, handler.go, validate.go}` — `User` now carries
  **`Role`**; all queries (`List`/`Create`/`GetByEmail`/`GetByID`) select it, so the
  middleware-loaded user carries the role used for authorization.
- `backend/internal/session/{session.go, repository.go}` — Session model; `GenerateToken`
  (crypto/rand, 32 bytes), `HashToken` (SHA-256), `Repository.Create`, **`GetByTokenHash`**
  (non-expired lookup, expiry enforced in SQL), **`DeleteByTokenHash`** (idempotent revoke)
  + `ErrSessionNotFound`.
- `backend/internal/auth/handler.go` — **`Login`** + **`Me`** (current user) + **`Logout`**
  (revoke session + expire cookie, idempotent `204`), `NewHandler`, cookie constants, dummy hash.
- `backend/internal/auth/middleware.go` (new) — **`RequireAuth`** (cookie → session → user →
  request context; fail-closed `401` on missing/invalid/expired) + **`UserFromContext`** helper
  using an unexported context-key type.
- `backend/internal/incident/{incident.go, repository.go, handler.go}` — `Incident` model;
  repository `Create`, `ListAll`/`ListByUser` (owner-scoped), **`GetByID`/`GetByIDForUser`**
  (per-object scoping) + `Update` + `ErrIncidentNotFound`; handlers `Create`, `List` (RBAC),
  **`Get`/`Update`** (per-object authz via a scoped read first; partial PATCH; 404 on not-yours).
- `backend/main.go` — now also builds `sessionRepo` + `authHandler`, registers
  `POST /api/sessions`, reads `FRONTEND_ORIGIN`/`SECURE_COOKIES` via `envOr`/`envBool`
  helpers, and `withCORS(next, allowedOrigin)` handles credentials + OPTIONS preflight.
- `frontend/src/api.ts` — API helper: `API_BASE` (Vite env-overridable), `User`/`Incident`
  types, `ApiError`, and `getMe`/`login`/`logout`/`register`/`getIncidents`/`createIncident`/
  **`updateIncident`** (PATCH) wrappers that all send `credentials: "include"`; error-surfacing.
- `frontend/src/App.tsx` — full auth UI (login/register toggle, auto-login, logout); the
  logged-in view renders the incident dashboard.
- `frontend/src/incidents.tsx` — `IncidentDashboard` (fetches `GET /api/incidents` on mount;
  RBAC-agnostic) + `CreateIncidentForm` (prepends the new row) + **`IncidentRow`** (per-row
  **status dropdown** that PATCHes on change, owns its saving/error state); discriminated-union
  list state; `handleUpdated` replaces the row in place.
- `frontend/src/App.css` — token-based styling (light/dark aware), accessible focus rings,
  monochrome buttons, link-styled toggle, and the incident dashboard (form, rows, colored
  severity/status **badges** driven by className).

**Git:** GitHub Flow on a protected `main`; features shipped via PRs #1–#6 (auth middleware,
logout, branch-retention docs, frontend auth, registration UI, incident domain) plus the
incident-UI PR. Merged branches are archived as `merged/*` (never deleted) — see
`WAYS-OF-WORKING.md` §13.

**Runtime state:** container `sentinelops-db` (Postgres 17) runs the DB.
⚠️ **Database contents do NOT travel between devices** — `pgdata` is a local Docker volume,
not part of the repo. Every machine starts with an empty database.

**Bringing up a fresh device (do this in order):**
1. `colima start` (macOS), then `docker compose up -d`, then `go run . migrate` from `backend/`.
   Schema should report version 5, dirty = f.
2. Register a user through the UI or `POST /api/users` (needs `fullName`, `email`, and a
   password of at least 12 characters).
3. **Promote that user to admin by hand**, because nothing else can: the admin screen is
   admin-only, so the first admin always has to be created out of band. This is true in
   production too and is a deliberate property, not a gap.
   `UPDATE users SET role='admin' WHERE email='you@example.com';`
4. The `audit_log` starts empty. It is append-only and hash-chained, so entries from another
   machine cannot be imported, and `go run . verify-audit` on an empty table reports
   "empty, nothing to verify" rather than failing.

The Mac's local database currently holds `jireh@example.com` (admin) and
`mallory@example.com` (analyst), five seeded demo incidents, and six audit entries. The second
Windows machine's database holds `testuser@example.com` (reporter) plus two accounts created to
smoke-test the containerized stack, `smoke-admin@example.test` (admin) and
`smoke-user@example.test` (analyst), one incident, and four audit entries. None of that exists
anywhere else. Test passwords in this project are disposable local-only strings and are never
real credentials.

---

## 6. ⏭️ THE EXACT NEXT STEP — pick a direction

### ⏭️ NEXT STEP: plan the next stage

v0.4.0 was released on 2026-11-22, closing issue #30 and milestone #3. The next stage starts the
standard way: a milestone, an issue, and the decisions briefed to the owner before anything is
written. Candidates, in the README roadmap's order:
1. **Observability, alerting and backups** for the deployed stack (logs, uptime checks, Neon's
   restore window, what to do when the audit check fails).
2. **The known gaps:** rate limiting on login, pruning expired sessions, registration's
   account enumeration, and a real test suite.
3. **Environments** (`dev`, `staging`, `prod`) once there is more than one deployment.

Small follow-ups that need no stage:
- Move every workflow off `actions/checkout` v4.4.0, which runs on the deprecated Node.js 20.
- When render-oss/terraform-provider-render#105 ships, return API deploys to `terraform apply`
  and delete `infra/deploy-api.sh`.
- Owner: enable 2FA on Render and the Neon organisations; keep every provider key in the
  password manager; optionally remove the unused Avast exception for `terraform.exe`; delete
  `.git-damaged-2026-11-21/` on the Windows machine once it is no longer wanted.

### ✅ Free cloud deployment (released as v0.4.0, issue #30, milestone #3)

**AWS was dropped** (its free plan now ends after six months and may want a card). The stage
deploys to **Cloudflare Pages** (frontend + `/api` proxy function), **Render free** (API image from
GHCR, Singapore) and **Neon free** (Postgres 17, Singapore), all declared in Terraform under
`infra/`. Settled decisions, so they are not re-opened:

- **Cookies:** a same-origin Pages Function proxies `/api/*` to Render, so the session cookie stays
  first-party. The API only answers requests carrying `PROXY_SECRET` (constant-time compare,
  `/healthz` exempt) and trusts `X-Client-IP` only on those.
- **State:** the `pg` backend in a separate Neon org/project (`sentinelops-tfstate`), direct
  connection, `sslmode=verify-full`. Terraform runs from Docker via `infra/terraform.sh` (see §9).
- **Tokens:** Render key, Cloudflare Pages-only token (expires 2027-05-21), Neon key for the
  **SentinelOps App** org only. All live in `.env`; the wrapper passes them by name.
- **API releases:** the image is pinned by `infra/api-image-tag.txt` (`sha-<commit>`, never `main`).
  To ship a new API: bump that file → `infra/migrate.sh` → **`infra/deploy-api.sh`** → `infra/terraform.sh
  plan` must say "No changes". Not `apply`: Render's provider 1.9.1 cannot update a free-plan service
  ("maintenance mode can only be configured for non-free tier services", upstream
  render-oss/terraform-provider-render#80, fix pending in #105), so the script deploys the pinned image
  through Render's API. Any other change to the API service (env vars included) hits the same bug.
  Delete the script once a provider release includes #105.
- **Migrations** run from the owner's machine with the same image (`infra/migrate.sh`), never at
  API startup and never from CI.
- **Database URL:** Neon's provider only gives the password as an ephemeral value, which Render's
  provider cannot take, so the direct connection string is copied once from the Neon console into
  `.env` as `PROD_DATABASE_URL`, and Terraform passes it on (sensitive; in state like
  `PROXY_SECRET`). `PROXY_SECRET` itself is generated by Terraform; nobody ever sees it.
- **Frontend deploys:** `.github/workflows/deploy-frontend.yml` builds with `VITE_API_URL=""` and
  uploads with `wrangler` (exact-pinned dev dependency) on pushes to `main` touching `frontend/`.
  Its Cloudflare token lives in the GitHub **Environment `production`**, limited to `main`.
- **The owner runs plan/apply** and the production scripts (`migrate.sh`, `deploy-api.sh`), or
  explicitly asks for them to be run on their behalf, case by case.

**First bring-up order** (steps 1–5 done 2026-11-21; `plan` reports no changes):
1. ✅ `infra/terraform.sh apply -target=neon_project.app`: creates only the database
   (Neon project `aged-mud-98089037`).
2. ✅ Neon console → project `sentinelops` → Connect, pooling **off** → copy into `.env` as
   `PROD_DATABASE_URL` (clipboard routine; never paste it in chat).
3. ✅ `infra/migrate.sh`: schema at version 5, not dirty.
4. ✅ `infra/terraform.sh apply`: Render service and Pages project. The API is at
   `https://sentinelops-api-a61s.onrender.com` (Render suffixed the taken name), the site at
   `https://sentinelops.pages.dev`. Two lessons: the Render key also needs **Workspaces → "Members,
   notifications, webhooks, and log and metric streams": Read**, because the provider reads log stream
   settings after every create (without it the service is created but not recorded, and was brought in
   with `infra/terraform.sh import render_web_service.api <srv-id>`); and Cloudflare requires
   `fail_open` to match in production and preview.
5. ✅ GitHub Environment `production` (branch rule: `main` only), secret `CLOUDFLARE_API_TOKEN` from
   a **separate** Pages-only token `sentinelops-github-deploy` (expires 2027-05-21, same as the
   Terraform token), variable `CLOUDFLARE_ACCOUNT_ID`. **Deploy frontend** runs when PR #37 merges.
6. ✅ First admin: the owner registered on the live site and was promoted with a guarded SQL
   `UPDATE` (only if exactly one user existed). Production now holds one admin, one incident
   ("Production smoke test") and four audit entries.

On every Command Prompt, run the scripts as `"C:\Program Files\Git\bin\bash.exe" infra/<script>.sh`:
plain `bash` there resolves to WSL, not Git Bash.

**Step 6, end-to-end test (done 2026-11-21):** the site serves the security headers and immutable
asset caching; `/admin` survives a reload; registration, login, logout, the admin screen, incident
creation and a status change all work through the proxy; the API answers 403 when called directly,
including login; a browser-sent `X-Proxy-Secret` or `X-Client-IP` is overwritten; every audit entry
records the visitor's real address; the session cookie is first-party and invisible to JavaScript;
`verify-audit` with the deployed image reports the chain intact (4 entries). The first request after
15 idle minutes can return Render's 502 "currently unavailable" page while the free API wakes.

**Step 7, audit anchor (code merged in #39, provisioned 2026-11-21):** anchors on a
protected `audit-anchors` branch (one line `<UTC time> <id>:<hash>` per run, force-push and deletion
blocked by a ruleset), checked every 6 hours by `.github/workflows/audit-verify.yml` with the deployed
image, connecting as `audit_verifier` (read-only on `audit_log`, created once with
`infra/sql/audit-verifier.sql`) whose URL is the secret `AUDIT_DATABASE_URL` in a GitHub environment
`audit` limited to `main`. Provisioned: the role (verified read-only), the environment and secret, the
branch with a header-only `anchors.log`, and the ruleset "Protect audit anchors" (deletion and
force-push blocked, no bypass). The anchor-capable image `sha-5014901…` was deployed on 2026-11-22
with `deploy-api.sh` (#40); **Audit verify** recorded the first anchor (`4:6b9c9f7f…`, commit
`0a39675` on `audit-anchors`) and a second run confirmed it holds. **Step 7 is done.**

`Infrastructure (Terraform)` became the ninth required check on `main` on 2026-11-22 (owner-approved
branch protection change; every other protection setting unchanged).

Released as **v0.4.0** on 2026-11-22.

### ✅ CI hardening (released as v0.3.0, issue #24, milestone #2)

**Decisions made 2026-11-21, do not re-litigate:**
- **Scope: scanning only.** The scheduled `verify-audit` run and anchoring the chain head outside the
  database moved to the AWS stage: CI's Postgres is empty on every run, so verifying it there proves
  nothing.
- **Scanners, best tool per job, all free:** `govulncheck` (Go dependencies, filters by reachability),
  `npm audit` (frontend dependencies), CodeQL (static analysis, Go and TypeScript), Trivy (both images
  plus Dockerfile and compose config), gitleaks (full history, checksum-verified binary).
- **Fail policy:** block only on High or Critical findings with a fixed version; report everything
  else. Go's vulnerability database has no severity scores, so for Go the filter is reachability: any
  vulnerability the code actually calls fails the build.
- **Results:** SARIF uploaded to Security → Code scanning, one category per scanner; npm findings are
  tracked by Dependabot alerts instead, since `npm audit` has no SARIF output.
- **GitHub settings switched on:** secret scanning, push protection, Dependabot alerts (alerts only,
  no automatic fix PRs).
- **Every action pinned to a full commit SHA** with the version in a comment, in `ci.yml` too.
- **Workflow:** `.github/workflows/security.yml`, separate from `ci.yml`; runs on PRs to `main`, pushes
  to `main`, Mondays 03:00 UTC, and by hand; default `contents: read`, `security-events: write` only on
  the jobs that upload.

**What the first scan run found, and the fixes (all merged before the workflow):**
- **#26:** `backend/go.mod` line 3, Go 1.26.5 → 1.26.11; govulncheck 17 reachable stdlib
  vulnerabilities → 0.
- **#27:** `vite` 8.2.1 → 8.3.8 in `frontend/package-lock.json`; npm audit 1 High → 0.
- **#28:** `frontend/Dockerfile` lines 30–37, `apk upgrade` plus `apk del curl` as root, back to uid 101;
  Trivy 14 fixable High/Critical in the nginx base image → 0. Trade-off accepted: builds pick up newer
  Alpine packages over time, which the weekly scan watches.
- CodeQL and gitleaks were clean on the first run: no flagged code paths and no secret anywhere in the
  history.

### ✅ Containerization (released as v0.2.0, issue #20)

**Decisions made, do not re-litigate:**
- **Two images**, an API and a static frontend, matching the target diagram where a CDN fronts
  static assets and a load balancer fronts the API. (One image serving both would have killed
  CORS entirely; rejected in favour of matching the architecture.)
- **`gcr.io/distroless/static-debian12:nonroot`** for the API runtime. Ships CA certificates for
  TLS to a managed Postgres, runs as uid 65532, has no shell or package manager.
- **`nginxinc/nginx-unprivileged:alpine`** for the frontend, because the official `nginx:alpine`
  runs its master process as root (verified: `User` is empty on the official image, `101` on the
  unprivileged one).
- **The app services go into `compose.yaml`**, so the whole stack runs containerized locally.

**Done and verified (commit `6068c7d`):** `backend/Dockerfile` and `backend/.dockerignore`.
Multi-stage, `CGO_ENABLED=0` static binary (every dependency is pure Go), `-trimpath -ldflags="-s -w"`.
**Final image 20 MB** against a 357 MB builder; the binary layer is 10.2 MB. Confirmed by running it:
non-root uid 65532, **no `/bin/sh` in the image at all**, fails loudly without `DATABASE_URL`, and
both `migrate` and `verify-audit` work from inside the container against the host database.
Migrations are `go:embed`-ed, so the binary is the whole application and image and schema cannot drift.

**Done and verified (commit `167ce27`):** `frontend/.dockerignore`, `frontend/nginx.conf.template`
and `frontend/Dockerfile`. Build stage `node:22-alpine` (the CI Node version) runs `npm ci` and
`npm run build`; runtime stage `nginxinc/nginx-unprivileged:alpine` serves only `dist/`.
- **Build-time vs run-time config, the point of this step.** `VITE_API_URL` is an `ARG` that Vite
  inlines into the bundle, so the bundle talks to one API origin forever. `API_ORIGIN` is an `ENV`
  (default `http://localhost:8080`) that the image's envsubst renders into the CSP at container start,
  so the same image works against any API. The default stops an unset variable from leaving a literal
  `${API_ORIGIN}` in the CSP, which would make the browser block every API call.
- **All `add_header` directives sit at server level**, with the cache policy picked by a `map` on
  `$uri`. nginx drops every inherited `add_header` in a location that declares its own, so a
  per-location `Cache-Control` would have silently stripped the security headers from that location.
- **Measured, not assumed:** build context **130 KB** (versus ~88 MB of `node_modules` without the
  `.dockerignore`); image 91.5 MB, of which 91.1 MB is the nginx base and ~320 KB is ours (299 KB
  bundle + config). Running it: uid 101; the CSP carried a fake `API_ORIGIN` passed at `docker run`;
  `/` and `index.html` send `no-cache`; `/assets/*.js` sends `max-age=31536000, immutable` and gzip;
  `/admin` returns `200 text/html` (SPA fallback); a missing asset is a real `404` that still carries
  the security headers (`always`).

**Open, owner's call:** responses carry `Server: nginx/1.31.7`. `server_tokens off;` would hide the
version; it was not in the agreed spec, so it was left out.

**Done and verified (commit `0722338`, written by the owner):** an `api healthcheck` subcommand at
the top of `main()`, before any database setup. It GETs `http://127.0.0.1:8080/healthz` with a
2-second client timeout and exits 0 on `200`, 1 otherwise. Probes liveness (`/healthz`), not
readiness (`/readyz`): the migrate job already guarantees the database, and readiness belongs to the
load balancer later. Proven natively: exit 1 with the server down (even with no `DATABASE_URL`), 0
with it up.

**Done and verified (commit `9dd997b`):** `compose.yaml` services, decided 2026-10-24:
- **`app` profile.** `docker compose up -d` still starts only `db`, so the native loop and quickstart
  are unchanged; `docker compose --profile app up -d --build` runs everything.
- **One-shot `migrate` service** running `api migrate` from the same image; `api` waits on
  `service_completed_successfully`, so it never starts against an old schema.
- **`api`** on `127.0.0.1:8080`, `DATABASE_URL` assembled in compose from `.env` with host `db`
  (service name), `FRONTEND_ORIGIN=http://localhost:8081`, `SECURE_COOKIES=false`, and a healthcheck
  in exec form (`["CMD", "/app/api", "healthcheck"]`, no shell).
- **`web`** on `127.0.0.1:8081`, `VITE_API_URL` as a build arg and `API_ORIGIN` at run time, starting
  only once `api` is healthy.
- The branch kept its pre-standard name `feat/docker`; the PR title uses `build:`.

**End-to-end verification:** start order db healthy → migrate exited 0 → api healthy → web; api uid
65532, nginx uid 101; CSP carried `connect-src 'self' http://localhost:8080`; the bundle contained
`http://localhost:8080`; CORS preflight announced only `http://localhost:8081`; register, SQL admin
bootstrap, login with an HttpOnly cookie, `/api/me`, incident create and list, an admin role change,
401 without a cookie, and logout all behaved; in a browser on `:8081`, login worked with no CSP
violations and a reload on `/admin` kept the admin screen; `verify-audit` from the image reported the
chain intact with 4 entries.

---

**✅ Audit logging shipped 2026-10-21.** `audit_log` records `user.login`,
`user.login_failed`, `user.logout` and `user.role_changed` with actor, target, outcome,
JSONB detail and source IP.

**Integrity, and its honest limit.** A `BEFORE INSERT` trigger SHA-256 chains each row to its
predecessor, so the application cannot forge, skip or backdate an entry. `UPDATE`, `DELETE`
and `TRUNCATE` are refused by triggers (TRUNCATE needs its own statement-level trigger, since
it bypasses row-level ones). `pg_advisory_xact_lock` serializes inserts so concurrent writers
cannot fork the chain. **Attack-tested:** forged hashes overwritten, update/delete/truncate
refused, a single-row edit detected. **A superuser who disables the triggers CAN rebuild the
whole chain and is NOT detected** — the fix is anchoring `verify-audit`'s head hash outside
this database, planned with deployment.

**Failure policy, deliberately asymmetric.** A role change and its audit entry share one
transaction, so a failed audit write rolls the change back (fault-injection tested: role
unchanged, no new row, HTTP 500). Login and logout have no transaction to join, so a failed
audit write is logged and the request still succeeds.

**Design notes:** the previous role for `{"from":…,"to":…}` comes from a CTE in the same
UPDATE statement, since subqueries see the pre-statement snapshot — no separate SELECT, no
race. `audit.Record`/`RecordTx` take an `execer` interface satisfied by both `*sql.DB` and
`*sql.Tx`; `user.Repository.UpdateRole` takes the same kind of `rowQuerier`. Chain
verification lives in SQL, not Go, so the canonical form has exactly one definition.
`authctx.Principal` gained `Email`, because an audit entry must name the actor.

**Incidents are now a full CRUD-ish domain with per-object authz**, all verified: create, list
(RBAC-scoped), get-by-id and partial update (owner/role-scoped, IDOR-safe 404s), with an inline
status dropdown in the UI. Good place to choose the next thrust:

**Option A — Role-management / admin UI** *(rounds out RBAC)*: an **admin-only** page to change
user roles (today done via SQL). The middleware half is already done — `RequireRole` exists and
`GET /api/users` is behind it. What remains is `PATCH /api/users/{id}` for the role change, with
its own guards (an admin must not be able to demote themselves into locking everyone out), and
the admin screen in the frontend.

**Option B — More incident depth**: `DELETE /api/incidents/{id}` (owner/admin only), an owner
column shown in the analyst view (return owner email from the API), status-transition rules,
comments/timeline, or file/evidence upload (a big security topic on its own).

**Option C — Step toward production** *(the "engineering around the app" goal)*: **audit
logging** → **Docker** for the app (multi-stage build) → **CI** (GitHub Actions: test/vet/build,
then SAST + dependency/secret scanning) → **AWS + Terraform**. This is the DevSecOps arc the
project set out to learn.

**Recommendation:** if you want to keep deepening security/authz, **A** (admin + role middleware).
If you're ready for the cloud/DevSecOps arc, start **C** with a Dockerfile + CI.

**Security to revisit:** account-enumeration inconsistency (login is timing-safe; registration's
409 leaks whether an email exists); keep per-object scoping on every new incident-by-id op
(never trust a client-supplied id).


## 7. After login: remaining auth pieces, then roadmap

Immediate next (pick one — see §6): **(A)** admin role-management UI + role middleware,
**(B)** more incident depth (delete, owner display, evidence upload), or **(C)** the production
arc (audit logging → Docker → CI/security scanning → AWS/Terraform). Incidents are now full
CRUD-ish with per-object authz and an inline status UI, all verified.

Then the broader roadmap (guide, not auto-permission): authorization/RBAC → incident
features → file/evidence handling → audit logging → security hardening → automated tests
→ Docker for the app → CI → security scanning → AWS architecture → Terraform →
deployment → CDN/WAF/TLS → monitoring/alerts → attack testing → reliability/backup →
cost/perf review → production hardening → documentation/portfolio review.

---

## 8. How to run locally (quick reference)

```bash
# 0) macOS only: start the container VM first (see §9)
colima start

# 1) Start Postgres
docker compose up -d

# 2) Build DATABASE_URL from .env WITHOUT printing the password, then migrate (from backend/)
set -a; . ../.env; set +a
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}?sslmode=disable"
go run . migrate

# 3) Run the API (same shell, same DATABASE_URL)
go run .

# 4) Run the frontend
cd ../frontend && npm install && npm run dev
```

Or run the whole stack in containers (stop it before `go run .`, which also needs :8080):

```bash
docker compose --profile app up -d --build   # UI http://localhost:8081, API :8080
docker compose --profile app run --rm --no-deps api verify-audit
docker compose --profile app down
```

Optional env vars (all have working local defaults, so no `.env` change is needed):
`FRONTEND_ORIGIN` (default `http://localhost:5173`), `SECURE_COOKIES` (default `false`;
**must be `true` in production**, or the session cookie travels in cleartext), and
`PROXY_SECRET` (unset locally, which switches the proxy check off; **must be set in
production** to the secret the Cloudflare proxy sends, see issue #30).

---

## 9. Per-device environment notes

**Windows:** Go lives at `C:\Users\<you>\AppData\Local\Programs\Go` (portable ZIP, no
admin). PowerShell subprocess PATH can be stale — refresh from Machine+User env, or prepend
`.../Go/bin` to PATH in the shell.

**Terraform, every device:** run it through `infra/terraform.sh` (Docker, `hashicorp/terraform:1.17.2`),
not a local install. It needs Docker running and, in `.env`, `PG_CONN_STR` in the Terraform-ready
format `.env.example` describes plus the provider credentials and IDs listed there (each device's
`.env` holds the same values; move them with the clipboard routine, never through chat or git). Each device's `.env` gets the same `PG_CONN_STR`; copy it from
Neon's Connect dialog (pooling off) and adjust it as described. Never `source` `.env`: the `&` in
the connection string backgrounds the assignment and silently leaves the variable empty.

**Second Windows machine, crash on 2026-11-21:** the machine lost power at 21:57 while git was
checking out `main`, zeroing `.git/HEAD`, the index and 30-odd working files. Everything was already
pushed, so `.git` was replaced from GitHub and the files reset to `main`. The damaged copy is kept as
`.git-damaged-2026-11-21/` (ignored through `.git/info/exclude`) and can be deleted once unneeded.

**Second Windows machine (Avast):** Avast's HTTPS scanning intercepts the local TLS connection
between a native `terraform.exe` and its providers (`x509: certificate signed by unknown
authority`), and a file exception for `terraform.exe` does not stop it. The Docker wrapper avoids
it. The same scanning breaks winget's `msstore` source, so use `--source winget`. Terraform 1.17.2
is also installed natively at `D:\Program Files\Terraform`, useful only for `terraform fmt`.
Since a reboot on 2026-11-21, Avast also intercepts HTTPS from **inside Docker containers**, so the
providers failed there too. Fixed by Web Shield website exceptions for `api.render.com`,
`console.neon.tech` and `api.cloudflare.com` (HTTPS scanning stays on for everything else). Check with
`docker run --rm curlimages/curl:8.11.1 -skv -o /dev/null https://api.render.com/ 2>&1 | grep issuer`:
the issuer must not be Avast. Docker Desktop may also quit on its own; start it again before Terraform.

**macOS (Apple Silicon) — set up 2026-08-16:**
- Toolchain via Homebrew: `brew install go colima docker docker-compose node`.
  Homebrew installs to `/opt/homebrew` and writes `/etc/paths.d/homebrew`, so **a new
  terminal tab** picks it up; an already-open shell keeps its stale PATH (`command not
  found: docker` is almost always this, not a broken install).
- **Colima instead of Docker Desktop** — free with no licensing conditions at any company
  size (Docker Desktop requires a paid licence above 250 employees / $10M revenue).
  Colima provides the Linux VM; the `docker` CLI and compose plugin are separate packages.
  `compose.yaml` needs no changes. Start it with `colima start` before `docker compose`.
- **`docker compose` needs one-time wiring.** Homebrew puts the plugin somewhere the CLI
  doesn't search, so `docker: unknown command: docker compose` until `~/.docker/config.json`
  contains:
  ```json
  { "cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"] }
  ```
- Verified working: Go 1.26.6 (go.mod needs 1.26.5), Colima 0.10.3, docker 29.7.2,
  compose 5.4.0, Node 26.7.0.
- **Git identity does not survive a clone.** Set it before committing on a new machine:
  `git config --global user.name "..."` and `git config --global user.email "..."`.
