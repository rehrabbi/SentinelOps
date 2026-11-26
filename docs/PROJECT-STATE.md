# Project State — Resume Here

> **Snapshot for continuing on any device.** Read `docs/WAYS-OF-WORKING.md` first (how
> we collaborate), then this file (where we are + what's next). `docs/learning-log.md`
> has the blow-by-blow history.
>
> **Last updated:** 2026-11-26 · **Current release:** ✅ **v1.1.0, the frontend redesign**, tagged and live at
> https://sentinelops.pages.dev, with all nine checks required (v1.0.0 was the first hardened
> deployment). Next: the owner's signed-in pass on the live site, then pick the next stage from the
> candidates in §6.

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

> The three `frontend/src` entries above (`App.tsx`, `incidents.tsx`, `App.css`) describe the
> frontend as released in v1.0.0. Since v1.1.0 they are replaced by the structure in the
> "Frontend redesign" entry of §6 (`ui/`, `layout/`, `pages/`, `overview/`, `theme/`, `motion/`,
> `brand/`, `styles/`), and `App.css` is gone.

**Git:** GitHub Flow on a protected `main`; features shipped via PRs #1–#6 (auth middleware,
logout, branch-retention docs, frontend auth, registration UI, incident domain) plus the
incident-UI PR. Merged branches are archived as `merged/*` (never deleted) — see
`WAYS-OF-WORKING.md` §13.

**Runtime state:** container `sentinelops-db` (Postgres 17) runs the DB.
⚠️ **Database contents do NOT travel between devices** — `pgdata` is a local Docker volume,
not part of the repo. Every machine starts with an empty database.

**Bringing up a fresh device (do this in order):**
1. `colima start` (macOS), then `docker compose up -d`, then `go run . migrate` from `backend/`.
   Schema should report version 6, dirty = f.
2. **Invite yourself as the first admin from the command line**, because there is no open
   sign-up and the admin screen is admin-only: from `backend/`,
   `go run . invite --email you@example.com --role admin --site http://localhost:5173`.
3. Open the printed link (valid 24 hours, single use), choose a name and a password of at least
   12 characters, and you are logged in as an admin. Invite anyone else from the admin screen.
   (Before v0.5.0 this was "register, then promote in SQL"; that path no longer exists.)
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

## 6. ⏭️ THE EXACT NEXT STEP — pick the next stage

### ⏭️ NEXT STEP: the owner's signed-in pass, then choose from the candidates below

The frontend redesign stage (issue #79, milestone #7) is in `main`. Every task was a pull request into
the long-lived `redesign` branch (cut from `main` at c6aa1cd), merged on green CI and archived as
`merged/rd-task-<n>`. A final review of the whole branch ran before launch, its findings were fixed in
pull request #97, and launch pull request #99 carried `redesign` into `main` on 2026-11-26, which
deployed it.

Done after launch: the deploy workflow's health check, CI, Security and an OWASP ZAP baseline scan of
the live site all passed; the public pages (landing, sign-in, privacy) were checked live, with the
security headers unchanged and the `/api/me` preload served; `v1.1.0` is tagged on 55e1776 and
published as a GitHub release from the CHANGELOG entry; `redesign` is archived as `merged/redesign`;
and `docs/images/social-card.png` is the repository's social preview.

Owner to-dos still open:
- Sign in on the live site and go through incidents, users, invites, resets and account security.
- Turn on 2FA for Backblaze.

**Locked decisions for this stage** (reasons in `docs/adr/0001-frontend-design-system.md`; values in
`docs/brand.md`; the spec is `docs/superpowers/specs/2026-11-25-frontend-redesign-design.md`):
- Direction: a watchtower at night. Deep ink-blue base, one ice-blue signal colour (`#86d8ff` at night,
  `#0a6ea8` by day), severity on its own colour scale so the signal never means danger.
- Logo: Facet, an eye of straight lines with a diamond pupil. Icons and logo files come from
  `frontend/src/brand/geometry.ts` (`npm run icons`).
- Type: Space Grotesk and JetBrains Mono through `@fontsource`, self-hosted because of the CSP.
- Styling: plain CSS tokens in `frontend/src/styles/tokens.css`, one class prefix per area (`ui-`,
  `landing-`, `auth-`, `signin-`, `incidents-`, `overview-`, `users-`, `account-`, `privacy-`). No framework.
- Themes: follow the system; toggle in the account menu; choice in `localStorage` (`sentinelops.theme`).
- Motion: `motion` 14.12.0 with presets (`frontend/src/motion/presets.ts`), reduced motion respected. The
  landing idle scan plays once (WCAG 2.2.2). Error toasts never auto-dismiss.
- Packages allowed for this stage: the two fonts and `motion` at runtime; Vitest, Testing Library, jsdom
  and `@resvg/resvg-js` for development only. Nothing else without asking.
- CSP and security headers are unchanged: no inline style or script, no external origins.
- Tests: `cd frontend && npm test`, required in CI. 292 tests in 32 files before launch.
- Signed-in screens load lazily; public pages are 428.72 kB of JavaScript (139.27 kB gzip).
- The credit line in the public footer names the owner by the GitHub handle `rehrabbi`, a call made by the
  builder for the owner to confirm. There is no terms-of-service page beside the privacy notice.
- Frontend layout: `src/ui/` (the kit), `src/layout/` (app and public shells, route focus,
  error boundary), `src/pages/`, `src/overview/` (counts and charts), `src/theme/`, `src/motion/`,
  `src/brand/` (logo) and `src/styles/` (tokens, base).
- Known smaller item, deferred: with two status saves in flight, focus goes to whichever row finishes
  first.

### After v1.1.0: candidates

1. ✅ **A browser-level test** of the login and reset flows in CI, to sit above the jsdom tests (the
   component tests exist now). Done 2026-11-26 on `feat/e2e-playwright`: `frontend/e2e/`, `npm run e2e`,
   the `End-to-end (Playwright)` job in `ci.yml` (not yet a required check; how to run it is in
   `CONTRIBUTING.md`).
2. ✅ **Transactional audit for authentication events**, so a lost entry fails the login, like role
   changes. Done 2026-11-26 in PR #103 (see the learning log).
3. **Environments**, still deferred while every free Render service shares 750 hours.
4. **Return API deploys to Terraform** once render-oss/terraform-provider-render#105 ships.
5. ~~**Frontend follow-ups from the launch review:** shared page-title, section-label and error-text
   classes in the kit; a real `robots.txt`; footer links at least 24 px tall (WCAG 2.5.8); returning to
   the page someone was on after their session expires; `aria-invalid` on the current-password field
   only when that field is wrong; and a test that checks the built `index.html` for inline code.~~ Done 2026-11-26 on
   `feat/launch-follow-ups`; the footer-link fix was in the public shell only, since the app shell has no footer.

**✅ Done 2026-11-26 in PR #103 (`feat/transactional-auth-audit`): transactional audit for
authentication events.** A successful sign-in and a sign-out now commit their session change with its
audit entry, or answer 500 and change nothing; a rolled-back sign-in sets no cookie. A sign-out takes its
owner from the deletion itself, so a lookup error is a 500 and one session is never logged out twice.
Password change, log out everywhere, invites, resets and the `invite` and `reset-password` subcommands
were already transactional. Failed sign-ins stay best effort on purpose, because the login limiter counts
only 401s (reason in `recordFailedLogin`, `backend/internal/auth/handler.go`). `backend/audit_rollback_test.go`
proves every one of these paths, and the role change, rolls back when its entry fails. The frontend's Log
out now signs the browser out only after a 204 or a 401; on any other answer the person stays signed in
and sees an error. One question for the owner remains, in `docs/learning-log.md` under "Questions to
revisit later": a wrong current password's failure entry is still strict, so a lost one is a 500 the
change limiter does not count.

Operating routines: run `infra/restore-drill.sh` at least monthly (also on a copy from Backblaze now
and then); follow `docs/RUNBOOK.md` for any alert.

### ✅ Hardening review (released as v1.0.0, issue #63, milestone #6)

Chosen 2026-11-22 over separate environments, which are deferred: every free Render service shares 750
instance-hours a month, production already uses about 744 (uptime checks keep it awake), and running
out would suspend production too. In scope, in order: password change and resets, seamless
`PROXY_SECRET` rotation, a scheduled passive ZAP scan of the live site, operational hygiene (Render
hours warning, `actions/checkout` off Node 20, keeping scheduled jobs alive, a second backup copy), then
the 1.0.0 review and release.

**Step 1, password change, log out everywhere, admin resets (decided 2026-11-22):**
`backend/internal/account`, routes in `server.go`, migration 7 (`password_resets`).
- `PUT /api/me/password` needs the current password (wrong → 403, audited as a failure, limited to 10 per
  visitor in 15 minutes on its own limiter), applies the sign-up rules, refuses the same password, and in
  one transaction sets the hash, ends every **other** session of the user (the current one stays), and
  writes `user.password_changed`.
- `DELETE /api/sessions` ends every session including the current one, clears the cookie, and writes
  `user.logout_all` with the count.
- `POST /api/users/{id}/password-reset` (admin only) works for **any other account, admins included**,
  never your own (403). Token as for invites (256-bit, SHA-256 stored, `no-store`, after `#`), **1 hour**,
  and issuing one deletes the account's earlier unused resets. Audited as `user.password_reset_issued`.
- `POST /api/password-resets/accept` is public, limited to 10 per visitor per hour (counting 204 and
  404); the password is checked before the token is touched, so a rule-breaking password leaves the link
  usable. The atomic claim, the new hash, ending **all** sessions and `user.password_reset` share one
  transaction.
- Frontend: an **Account security** page (`/account`), a **Reset password** button per user on the
  admin screen (now titled Users) that shows the link once, and `/reset#<token>`, open whether or not
  someone is logged in.
- Pruning deletes resets a week after use or expiry, like invites.
- Tests: six new integration tests and the extended prune test; 16 deliberate regressions, all caught
  (one first slipped through and exposed a flawed test, fixed before merging); race detector clean.
- **Browser check passed locally (2026-11-22)**, with throwaway `uicheck-*@example.test` accounts: wrong
  current password shown and the session kept; change, then log out everywhere; an admin issues a link
  (none on their own row), opens it in the same browser, the token leaves the address bar, the reset
  works and the admin stays logged in; only the newest password logs in; every step is in the audit
  log with its session count; the Users screen holds the link at phone width. It found one real bug:
  the CORS preflight did not list `PUT` (fixed, with a test). Local-only snag: a leftover test API on
  port 8080 (IPv6) answered instead of the container until it was stopped.
- Known gap, written into the README: with no email, if the only admin forgets their password nobody can
  issue them a link.

**Deployed 2026-11-24** as `sha-12e9dc4…` (#64, pinned in #65), at the owner's request:
`infra/migrate.sh` (production at schema 7, clean), `infra/deploy-api.sh`, then a saved refresh-only
plan, inspected (the image tag, the site's own deploy of #64, and Neon's size) and applied; Terraform
"No changes". Through the site, the new routes answer 401 without a session and the reset form 404
for a bad token; direct calls still get 403; `backup_reader` can read `password_resets` and not write it.

**Step 2, seamless `PROXY_SECRET` rotation (decided 2026-11-24):** the API also accepts an optional
`PROXY_SECRET_PREVIOUS`, only during a rotation (both compared in constant time, every time). It warns at
every start while one is set, refuses to start with a previous secret but no current one, and marks
each request the previous secret let in with `"proxy_secret":"previous"` in the request log, so the
switch-over is visible; it stays valid until the runbook's last step deletes it (no automatic expiry).
The proxy's secret is set with wrangler (`infra/set-pages-secret.sh`), not Terraform: the Pages project
depends on the Render service, so targeting it plans a Render update the free plan refuses.
`infra/set-render-env.sh` gained `PROXY_SECRET_PREVIOUS` and `--delete` for it only;
`infra/probe-site.sh` fetches `/api/healthz` through the site every second during the change.
Done means the real secret rotated live with the probe reporting zero non-200 answers and Terraform
"No changes" (owner's choice). Tests: the three phases of a rotation through the real router, the
startup rule, and the log mark; 8 deliberate regressions, all caught (a first miss showed the startup
rule lived only in `main()`, so it moved into a tested function); race detector clean.

**Live rotation, 2026-11-24 (owner's request):** API `sha-f8606ec…` deployed (#68), then runbook §5 end
to end with `infra/probe-site.sh` running throughout: **570 requests through the site, 0 not 200**.
Render's logs showed requests marked `"proxy_secret":"previous"` until 13:19:43 UTC, the moment the
new frontend deployment took over, and none in the 4 minutes after; then the previous secret was
deleted and the API redeployed; Terraform ends at "No changes". The drill found three things:
- A bug in `infra/set-render-env.sh` (never run before): it gave curl both the API key and the body on
  standard input, so the body arrived empty and Render answered 400. Nothing wrong was stored; the PUT
  now goes through Python's standard library, reading both from its environment.
- The Cloudflare provider stored the updated secret as `plain_text` (readable through the account's
  API); a second apply set `secret_text` again, confirmed through Cloudflare's API. The runbook now
  checks for it. The exposure stayed inside the account, which with Terraform's state already held the
  value, so it was not rotated again.
- Avast's HTTPS scanning was intercepting Docker's traffic again after a restart; the owner re-added the
  Web Shield exceptions for api.render.com, console.neon.tech and api.cloudflare.com.

**Step 3, a scheduled passive scan (decided 2026-11-24):** `.github/workflows/zap-baseline.yml` runs
OWASP ZAP's baseline (official image, ZAP 2.17.0, pinned by digest) against https://sentinelops.pages.dev
every Monday at 04:17 UTC and on demand: a minute of crawling, passive checks only, no login, no attacks.
`.zap/judge.py` fails the run on any finding of **Medium or above** not marked `IGNORE` in
`.zap/rules.tsv`, where each accepted finding carries its reason; reports go to a 90-day artifact and a
table on the run page (no GitHub issues). The first scan of production (run locally) found two Mediums
and a Low, all fixed in `frontend/public/_headers`: `style-src 'unsafe-inline'` (the production build
has no inline styles; checked in a browser on every screen, favicon included, with no CSP violations),
Cloudflare Pages' default `Access-Control-Allow-Origin: *` on static files (removed with `!`), and no HSTS
(added; `.dev` is preloaded anyway). The two Informational notes are IGNOREd with reasons. A scan of the
local container also flagged nginx's version in `Server`, now off (`server_tokens off`).

Merged as #70; the first scheduled-workflow run against production **passed** (nothing of Medium or
above). It also listed Lows that only warn: no `Permissions-Policy`, and no cross-origin isolation
headers (COOP, COEP, CORP). Candidates for step 4.

**Incident, 2026-11-24, 13:47:01 to 13:48:47 UTC (about 2 minutes):** the frontend deployment of #70
refused every `/api` call with 403, so nobody could log in. Cause: rotation step 8 had applied the
proxy's `PROXY_SECRET` through Terraform; the Cloudflare provider stored a wrong value (first as
`plain_text`, then, after the type fix, still wrong). Cloudflare never returns secret values, so
Terraform kept saying "No changes", and the running deployment, which carried wrangler's correct value,
hid it until the next one. Fixed by setting the secret again with wrangler from Terraform's state
(which matched Render) and redeploying. Prevention (#71): Terraform ignores that one value after
creation (`ignore_changes`, proven by a plan that regenerates the secret and no longer touches
Pages), wrangler is its only writer, and **Deploy frontend** now ends by checking `/api/healthz`
through the exact deployment it uploaded, failing (and emailing) on anything but 200. Runbook §4 has
the recovery, §5 step 8 is corrected. For the learning log at the stage's end: a drill's success
criterion has to include the next deployment, not just the moment.

**Step 4, operational hygiene (decided 2026-11-24):** in three parts.
- **A, built:** every workflow off Node.js 20 (`actions/checkout` v7.0.1, `actions/setup-go` v7.0.0,
  `actions/setup-node` v7.1.0, all Node 24, pinned by commit; setup-go 7.1.0 was skipped as under two
  weeks old). The site's last ZAP Lows fixed in `frontend/public/_headers` and the nginx template:
  `Permissions-Policy` (device features off, clipboard kept for the admin's Copy buttons) and
  cross-origin isolation (`Cross-Origin-Opener-Policy` and `-Resource-Policy` `same-origin`,
  `-Embedder-Policy` `require-corp`); checked in a browser on the local container (isolated, login,
  Users screen, reset link, a new incident through the cross-origin API, no console errors). A monthly
  `keep-schedules-alive.yml` re-enables every workflow in `.github/workflows` through the API, which
  restarts GitHub's 60-day inactivity clock for scheduled runs without committing anything.
- **B, built:** `infra/render-hours.sh` projects the worst case
  for Render's 750 free hours (every free web service that is not suspended, awake all month) and fails
  above 750 or when the API is suspended; `render-hours.yml` runs it every Monday with the Render key
  from a `render` environment limited to `main` (owner's choice, knowing Render keys cannot be limited).
  Tested against the workspace (720 of 750 for November) and against made-up service lists. Environment
  `render` created 2026-11-24 (owner-approved), limited to `main`, holding `RENDER_API_KEY` (piped from
  `.env`, never printed).
- **C, built:** the nightly Backup also uploads the same encrypted file to the private Backblaze B2
  bucket `sentinelops-backups-irmqvmze` (10 GB free, no card; owner's account, created 2026-11-25),
  through `infra/b2-upload.py` (standard library only; the key comes from the environment; B2 checks
  the SHA-1 and so does the script). Bucket: private, Backblaze's own encryption on, **Object Lock on, 90 days, compliance mode** (the website
  offers only compliance; owner's choice over governance through the API),
  lifecycle hides files after 90 days and deletes them a day later. Key `sentinelops-backup-writer`:
  Backblaze's "Write Only" preset, limited to that bucket. It turned out to include `deleteFiles` and
  bucket-settings permissions, and once Object Lock was on, `writeBucketRetentions` too, so a leaked key
  could lower the bucket's default lock. Hence every upload sets its own compliance lock for 90 days
  (`infra/b2-upload.py`), which nobody can shorten. The first key (`…0001`, deleted 2026-11-25 at the owner's request) failed to authorize in CI
  (`bad_auth_token`, most likely a newline or wrong value from the first clipboard transfer); the second
  (`…0002`, `sentinelops-backup-writer-2`) was checked against Backblaze from the owner's machine before
  being stored, as exact bytes, never displayed; stored as `B2_KEY_ID` and
  `B2_APPLICATION_KEY` in the `backup` environment. A B2 failure fails the run after the GitHub artifact
  is stored.

**Step 5, the 1.0.0 review (decided 2026-11-25):**
- **The sole-admin lockout is closed:** `reset-password`, a CLI subcommand like `invite` (`cli.go`), issues a
  one-time reset link with database access; `account.IssueReset` takes a nil issuer for the command line,
  which may reset any account, the only admin's included; the API still refuses an admin's own account.
  Audited as `command-line` with no `created_by`. One test, six deliberate regressions, all caught (one
  only after the test was tightened to require a helpful error).
- **Restore drills, 2026-11-25:** both passed. The newest GitHub backup (`sentinelops-db-20261125T0116Z`)
  and the same file downloaded from Backblaze (19,869 bytes, SHA-1 `31ab9d0a…`, identical) each restored
  to schema 7, with 1 user, 1 incident and 4 audit entries, and anchor `4:6b9c…` still holds. The drill
  first failed because Avast intercepted the container's download of `age` from
  `dl-cdn.alpinelinux.org`; the owner added that exception.
- **The 1.0.0 promise:** semantic versioning from here: a major version for anything that breaks the HTTP
  API or how it is run, minor for features, patch for fixes (CHANGELOG, README).
- The stage's learning-log entry is written and the open questions are closed, except the Render
  provider, still pending upstream.

Released as **v1.0.0** on 2026-11-25.

Operating routines: run `infra/restore-drill.sh` at least monthly; follow `docs/RUNBOOK.md` for any
alert.

### ✅ Observe and recover (released as v0.6.0, issue #54, milestone #5)

Chosen 2026-11-22 over separate environments: nobody would notice an outage, and nothing beyond
Neon's 6-hour window protected the data. In scope, in order: encrypted backups with a restore drill,
structured request logs, uptime alerts, and a runbook.

**Step 1, encrypted backups (decided 2026-11-22):** `.github/workflows/backup.yml` runs nightly at
02:47 UTC: `pg_dump` (postgres:17) through `backup_reader` (read-only, created with
`infra/sql/backup-reader.sql`; URL is the secret `BACKUP_DATABASE_URL` in a GitHub environment `backup`
limited to `main`), piped straight into `age` with the public key in `infra/backup-recipient.txt`, and
uploaded as an artifact kept 90 days. The private key exists only with the owner (password manager, and
`~/.sentinelops/backup-key.txt` on the machine that runs the drill): lose it and the backups are
unreadable. `infra/restore-drill.sh` restores the newest backup into a throwaway container and runs
`verify-audit` against the newest anchor the backup should contain; a full restore creates triggers
after loading data, so the stored hashes are untouched. Rejected: a private repository (grows forever),
Cloudflare R2 (an extra credential, card requirement unconfirmed).

Provisioned 2026-11-22 (owner-approved): `backup_reader` (SELECT on all six tables only), environment
`backup` (main only) with `BACKUP_DATABASE_URL`. The key pair was generated into
`~/.sentinelops/backup-key.txt` on the second Windows machine; the owner keeps the file in their
password manager. **First backup** `sentinelops-db-20261122T1032Z` (17,546 bytes, kept to 2027-02-20);
**first real restore drill passed**: schema 6, 1 user, 1 incident, 4 audit entries, anchor `4:6b9c…`
holds. The drill first failed on Windows (host paths not converted for `gh`/`docker cp`), fixed in
the same PR as this note.

**Step 2, request logs (decided 2026-11-22):** `backend/internal/reqlog`, outermost in `newHandler`:
one JSON line per request via `log/slog` (request ID also sent as `X-Request-ID`, method, path without
query, status, duration, bytes, visitor key, user ID when logged in); levels INFO / WARN for 4xx / ERROR
for 5xx. The visitor and user are filled in by inner layers through a context slot (after the proxy
check, and in `RequireAuth`). Never logged: cookies, headers, query strings, bodies. Every `/healthz`
is logged (owner's choice). The server's other messages go through the same JSON handler; CLI
subcommands keep plain text. Logs stay in Render's dashboard; shipping them elsewhere is deferred.
Five deliberate regressions were caught by the tests.

**Step 3, uptime alerts (decided 2026-11-22):** UptimeRobot free (5-minute checks, email alerts to the
owner), account created by the owner and monitors configured in the owner's browser. Two monitors:
`https://sentinelops.pages.dev/` and `https://sentinelops.pages.dev/api/healthz` (new route, proxy
secret required, no database), so one check covers Cloudflare, the proxy, the secret, Render and the
API. Nothing monitored touches the database: Neon's free 100 compute-hours a month would not survive
checks every 5 minutes. A side effect accepted: the checks keep the free Render instance awake. No
public status page.

Deployed 2026-11-22 as `sha-78198ac…` (#59): request logs and `/api/healthz` are live; through the site
`/api/healthz` answers 200, directly 403; responses carry `X-Request-ID`; Terraform "No changes".

**UptimeRobot configured 2026-11-22:** account created by the owner (free plan, email alerts to the owner's
address); monitors `https://sentinelops.pages.dev/` and `https://sentinelops.pages.dev/api/healthz`, both
HTTP(S), 5-minute interval, default location, both Up. A third monitor pointing at a route that does not
exist (`/api/alert-test-not-a-real-route`, a 404 through the proxy) went down and the owner **received the
alert email**, proving the real down path end to end; it is now paused (not deleted). Each monitor's page
also has a "Test Notification" button for a quicker check. The UptimeRobot setup was made
by hand in its dashboard, not in Terraform (no provider was evaluated); this note is the record of it.

**Step 4, runbook (decided 2026-11-22):** `docs/RUNBOOK.md` covers a failed Audit verify (treated as a
security incident: preserve evidence, find the last good backup, rotate the owner login), a failed backup,
restores at three scales (Neon's 6-hour window; a backup into a new database, then recording the restore
in the anchor log by hand; a full rebuild), outages (triage, logs by request ID, rollback), and rotating
every secret. Rotation helpers: `infra/rotate-readonly-role.sh` and `infra/set-render-env.sh` (Render's
API, because Terraform cannot update the free service). **Exercised live 2026-11-22:** both read-only
passwords rotated, then Audit verify and Backup passed with the new ones. `PROXY_SECRET` rotation
accepts about a minute of 403s and is written down but **not yet exercised**; its order avoids a trap
(targeting the Pages project would also try to update Render, which fails).

Released as **v0.6.0** on 2026-11-22.

Small follow-ups that need no stage: ~~move workflows off `actions/checkout` v4.4.0 (Node.js 20)~~
done in the hardening review; return API deploys to `terraform apply` once render-oss/terraform-provider-render#105 ships; owner
items listed under the free cloud deployment below; observe a live login 429 once, deliberately.

### ✅ Harden the live app (released as v0.5.0, issue #45, milestone #4)

Chosen 2026-11-22 over observability and environments, because the public deployment made the
known gaps real. In scope: an integration test suite, login rate limiting, registration that does
not reveal existing accounts, and pruning expired sessions. Observability/backups and environments
stay on the roadmap after it.

**Step 1, integration tests (decided 2026-11-22):** HTTP end to end through `newHandler`
(`backend/server.go`, extracted from `main()` with no behaviour change) against a throwaway Postgres:
the Compose database locally, a `postgres:17-alpine` service in CI's `Backend (Go)` job. Each run
creates and drops `sentinelops_test_<random>` (a fresh database, because `audit_log` refuses
`TRUNCATE`); tests refuse non-localhost URLs, skip locally without `TEST_DATABASE_URL`, and fail in CI
without it. Written in `backend/integration_test.go`; two deliberate regressions (cookie not
`HttpOnly`, 403 instead of 404) were both caught before merging.

Merged in #46.

**Step 2, rate limiting (decided 2026-11-22):** in API memory (one instance; restarts clear it), in
`backend/internal/ratelimit` and wired in `server.go`. Login: 10 *failed* attempts per visitor per
15 minutes, then `429` + `Retry-After` before any password check; successes never count and never
reset. Registration: 5 per visitor per hour, counting 201 and 409 only. Key: `audit.ClientIP` (proxy
address only behind the secret), IPv6 by /64. Slots are reserved before each attempt, so concurrent
guesses cannot exceed the limit; memory is capped at 100,000 keys and fails closed. A per-account
limit was rejected because it lets anyone lock a victim out. Four deliberate regressions were caught
by the tests before merging.

Merged in #47; the login form's 429 message in #48.

**Step 3, invite-only accounts (decided 2026-11-22):** with open sign-up and no email, enumeration
cannot be hidden (sign up, then log in with the chosen password), so open sign-up was removed. Admins
issue one-time invites (`POST /api/invites`, admin only): 24 hours, single use, token stored as a
SHA-256 hash, response `Cache-Control: no-store`, link `<site>/invite#<token>` (the fragment never
reaches a server; the page wipes it after reading). `POST /api/invites/accept` is public, rate limited
(5 per visitor per hour, counting 201/409/404), and creates the account, uses the invite and writes
`user.invite_accepted` in one transaction; issuing writes `user.invited`. Bootstrap: the `invite`
subcommand (`backend/cli.go`), audited as `command-line`. Migration 000006 adds `invites`. Email
verification was rejected because sending mail needs a paid domain. Five deliberate regressions were
caught by the tests.

**Production rollout (done 2026-11-22, at the owner's request):** image `sha-cc576af…` (#49, provenance
verified) via `migrate.sh` (production at version 6, `invites` present) → `deploy-api.sh` (live,
healthy) → `apply -refresh-only` → `plan` "No changes". Live checks: `POST /api/users` 405, `POST
/api/invites` 401 when logged out, an unknown invite token 404, direct API calls 403; the deployed
bundle has the invite screens and the 429 message and no registration form. This also shipped steps 1
and 2 (rate limiting) to production. Not yet observed live: a 429 and its "Try again in N minutes"
wording, which would lock the owner's own network out of login for 15 minutes.

**Step 4, pruning (decided 2026-11-22):** `backend/internal/prune`, wrapped around the login route in
`server.go`. After a successful login (200), at most once per hour per process: `DELETE` expired
sessions, and invites used or expired more than 7 days ago (the audit log keeps the record). A failure
is logged and never affects the login. Not a security fix (expired sessions were already refused);
data minimisation and bounded growth. Rejected: a background timer (only runs while awake anyway),
a GitHub Actions job (would need a delete-capable credential in GitHub), `pg_cron` (Neon's free
compute suspends). Four deliberate regressions were caught by the tests.

Step 4 deployed 2026-11-22 as `sha-840b3d0…` (#52): `migrate.sh` (nothing new), `deploy-api.sh`,
`apply -refresh-only`, `plan` "No changes". Released as **v0.5.0** on 2026-11-22.

Small follow-ups that need no stage:
- ~~Move every workflow off `actions/checkout` v4.4.0, which runs on the deprecated Node.js 20.~~ Done in the hardening review.
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
  To ship a new API: bump that file → `infra/migrate.sh` → **`infra/deploy-api.sh`** →
  `infra/terraform.sh apply -refresh-only` (records the image output; changes no resource) →
  `infra/terraform.sh plan` must say "No changes". Not `apply`: Render's provider 1.9.1 cannot update a free-plan service
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

**Security to revisit:** account enumeration was closed in v0.5.0 by removing open sign-up (invites
only); keep per-object scoping on every new incident-by-id op
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
`console.neon.tech`, `api.cloudflare.com` and, for the restore drill's `age` install,
`dl-cdn.alpinelinux.org` (HTTPS scanning stays on for everything else). Check with
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
