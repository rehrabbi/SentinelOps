<h1 align="center">SentinelOps</h1>

<p align="center">
  A production-style, cloud-native incident and ticket management platform,<br>
  built to practise the security and cloud engineering <em>around</em> a SaaS app.
</p>

<p align="center">
  <a href="https://github.com/rehrabbi/SentinelOps/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rehrabbi/SentinelOps/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Go" src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green"></a>
  <a href="https://github.com/rehrabbi/SentinelOps/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/rehrabbi/SentinelOps"></a>
</p>

<p align="center">
  <img src="docs/images/dashboard.png" alt="The incidents screen in the dark theme: three headline counts, charts by severity, status and day" width="700">
</p>

---

## What this is

SentinelOps is a secure incident and ticket tracker. A reporter files an incident, an
analyst triages it, and every read and write is checked against who is asking. It is a
working application, and it is also a deliberate study of the engineering that surrounds
one, meaning authentication, authorization, application security, containers, CI/CD,
infrastructure as code, and cloud architecture.

It is built incrementally, and the git history is meant to read as an engineering story,
one concern per branch and one concern per pull request.

**Status:** the current release is [v1.0.0](https://github.com/rehrabbi/SentinelOps/releases/tag/v1.0.0),
the first hardened deployment, **live at [sentinelops.pages.dev](https://sentinelops.pages.dev)**:
account recovery without email, secret rotation without downtime, a weekly passive scan of the live
site, strict security headers, and backups in two places, both restored before release. Every release
is described in the [changelog](CHANGELOG.md).

**What works today**

- Accounts by one-time invite only (no open sign-up), and login with server side sessions
  in an `HttpOnly` cookie
- Password change and "log out everywhere" for every user, and one-time password reset links
  that an admin issues, so a forgotten password does not lock anyone out
- Role based access control across three roles, reporter, analyst, and admin, with an
  admin only user directory and an admin screen for changing roles
- An append-only, hash-chained audit log recording logins, failed logins, logouts, role
  changes, invites, password changes and resets, with a command that verifies the chain
- Incident create, list, read, and partial update, each one scoped by owner and role
- A React dashboard with severity and status badges and inline status editing
- Health and readiness endpoints, versioned SQL migrations, Postgres in Docker
- The whole stack runnable in containers: a 20 MB distroless API image, an unprivileged
  nginx image for the frontend, and a Compose profile that runs migrations first
- A public deployment on free services, declared in Terraform: Cloudflare Pages in front, the
  API on Render, Postgres on Neon, and a proxy that keeps the session cookie first-party
- The audit chain verified every 6 hours against a head recorded outside the database

## Screens

| Landing page | Sign in |
|---|---|
| <img src="docs/images/landing.png" alt="The landing page: the headline 'Incident tracking, watched closely.', Sign in and Have an invite buttons, and the eye mark inside nested diamonds" width="380"> | <img src="docs/images/login.png" alt="The sign-in screen: the eye mark above a card with email and password fields and a Sign in button" width="380"> |

| Incidents and overview | The same screen in the light theme |
|---|---|
| <img src="docs/images/dashboard.png" alt="The incidents screen in the dark theme: three headline counts and charts by severity, status and day" width="380"> | <img src="docs/images/incidents-light.png" alt="The incidents screen in the light theme, with the same counts and charts on a pale background" width="380"> |

| Incident list | Users (admin) |
|---|---|
| <img src="docs/images/incident-list.png" alt="The incident list: each row has a title, a severity badge, the report time and a status control" width="380"> | <img src="docs/images/admin-roles.png" alt="The users screen: an invite form and one row per account with a role selector, Save and Reset password" width="380"> |

| Account | Privacy notice |
|---|---|
| <img src="docs/images/account.png" alt="The account screen: a change-password form and a Log out everywhere button" width="380"> | <img src="docs/images/privacy.png" alt="The public privacy notice, opening with a short version of what the app keeps" width="380"> |

<p align="center"><em>On the users screen your own row is locked, because an admin may not change their own role. Screenshots are from the local stack with test data.</em></p>

### Brand and design

The mark is called Facet: an eye drawn in straight lines, with a signal-blue diamond for the
pupil. The look is a watchtower at night: deep ink-blue surfaces and one ice-blue signal colour,
with a light theme that follows the system setting (or the toggle in the account menu). Type is
Space Grotesk, with JetBrains Mono for IDs, timestamps and counts, both served from the site itself
because the Content Security Policy allows no other origin. Motion is bold on the landing and
sign-in pages and quiet where people work, and it respects `prefers-reduced-motion`. The details are
in [docs/brand.md](docs/brand.md), and the reasons for the choices are in
[docs/adr/0001-frontend-design-system.md](docs/adr/0001-frontend-design-system.md).

## Architecture

The application is a Go API and a React client against Postgres. In production every request
goes to one address: Cloudflare serves the frontend and forwards `/api` to the API, so the
browser only ever talks to one site.

```mermaid
flowchart LR
    B["Browser"] -->|"HTTPS, one site"| CF["Cloudflare Pages<br/>static files + /api proxy function"]
    CF -->|"/api/* + X-Proxy-Secret<br/>+ visitor address"| API["Render, free plan<br/>Go API image pinned by commit"]
    API -->|"TLS, parameterised SQL"| DB[("Neon Postgres 17<br/>free plan")]
    B -.->|"direct calls: 403"| API
```

Inside the API, each request passes the proxy check, CORS, `RequireAuth`, and per-object
authorization before any SQL runs. Delivery and verification run around it.

```mermaid
flowchart TB
    PR["Pull request"] --> CI["CI and Security<br/>build, test, scan"]
    CI -->|"merge to main"| PUB["Publish<br/>scan again, push to GHCR,<br/>attest provenance"]
    CI -->|"merge to main"| DF["Deploy frontend<br/>wrangler, production environment"]
    DF --> CF["Cloudflare Pages"]
    PUB -.->|"bump api-image-tag.txt,<br/>migrate.sh, deploy-api.sh"| API["Render API"]
    TF["Terraform in Docker<br/>state in a separate Neon org"] -.-> CF
    TF -.-> API
    TF -.-> DB[("Neon Postgres")]
    AV["Audit verify, every 6 hours<br/>read-only role"] --> DB
    AV --> AN["audit-anchors branch<br/>protected, append-only"]
```

All of it is free: no card is on file with any provider. The trade-offs are that these
platforms hide private networking, and that the free API sleeps after 15 idle minutes.

Complexity is added only when a real problem justifies it. There are no microservices, no
queues, and no ORM, because nothing in the project has yet needed them.

## Security

Security is the point of the project rather than a footnote, so each control is tied to
the threat it answers.

| Threat | Control | Where |
|---|---|---|
| SQL injection | Parameterised queries only, no SQL is ever assembled from input | every `repository.go` |
| Broken object level authorization, IDOR | Owner scoped SQL on every by id read and write, and a `404` rather than a `403` so existence never leaks | `internal/incident/handler.go` |
| Privilege forging | Role is read from the database on every request, never taken from the client | `internal/auth/middleware.go` |
| Sensitive data exposure | The user directory is admin only, enforced by a `RequireRole` middleware chained inside `RequireAuth` | `internal/auth/middleware.go` |
| Privilege escalation | Role changes are admin only, accept no field but `role`, and an admin cannot change their own, so at least one admin always remains | `internal/user/handler.go` |
| Repudiation, "nobody did that" | Every login, failed login, logout and role change is recorded with the actor, target, outcome and source address | `internal/audit/` |
| Covering tracks | The audit log refuses `UPDATE`, `DELETE` and `TRUNCATE`, and every row is SHA-256 chained to its predecessor by a database trigger, so edits are detectable with `go run . verify-audit`. Every 6 hours a scheduled run checks the production chain against the head it recorded last time on the protected `audit-anchors` branch, so even a chain rebuilt from scratch is caught | `migrations/000005_create_audit_log.up.sql`, `.github/workflows/audit-verify.yml` |
| An unrecorded privileged action | A role change and its audit entry share one transaction, so if the entry cannot be written the change is rolled back | `internal/user/handler.go` |
| Weak password storage | bcrypt, with a 12 character minimum and no composition rules, following NIST 800-63B | `internal/user/validate.go` |
| Account enumeration by timing | An unknown email still runs a bcrypt compare against a dummy hash, so both failures cost the same | `internal/auth/handler.go` |
| Account enumeration and unwanted sign-ups | There is no open sign-up, so no endpoint answers "is this email registered?". Accounts come only from one-time invites that an admin issues: 24 hours, single use, stored only as a SHA-256 hash, and audited with the account they create | `internal/invite/` |
| Password guessing | After 10 failed logins in 15 minutes a visitor gets `429` before any password is checked; wrong current passwords on a password change have the same limit, accepting invites is limited to 5 per visitor per hour, and using reset links to 10. Visitors are keyed on the proxy-verified address (IPv6 by /64), slots are reserved so parallel requests cannot exceed the limit, and correct logins never count | `internal/ratelimit/`, `server.go` |
| A stolen session or password outliving its discovery | Changing a password ends every other session of that user, a reset ends all of them, and "log out everywhere" ends them on demand; a password change needs the current password, so a stolen session alone cannot lock the owner out | `internal/account/` |
| A forgotten password becoming a permanent lockout | An admin issues a one-time reset link for any other account: 1 hour, single use, stored only as a SHA-256 hash, the newest one replacing any earlier, and audited when issued and when used. Nobody can reset their own account this way, so a stolen admin session cannot take over its own account's password without the current one | `internal/account/` |
| Session theft through XSS | Opaque 256 bit token in an `HttpOnly` cookie, never readable by JavaScript | `internal/auth/handler.go` |
| Session theft at rest | Only the SHA-256 hash of the token is stored, so a database leak yields nothing usable | `internal/session/repository.go` |
| An outage nobody notices | UptimeRobot checks the site and `/api/healthz` through the proxy every 5 minutes and emails the owner when either fails; the proxied check covers Cloudflare, the proxy, the shared secret, Render and the API in one request, and never touches the database | UptimeRobot (outside the repository), `server.go` |
| An incident nobody can reconstruct | Every API request leaves one JSON log line with a request ID (returned as `X-Request-ID`), status, duration, visitor key and user ID, and never cookies, headers, query strings or bodies; a test proves passwords, tokens and secrets stay out | `internal/reqlog/` |
| Losing the database, or a backup that cannot be read or trusted | A nightly `pg_dump` through a read-only role, encrypted with `age` inside the CI runner before it is stored, so GitHub only ever holds ciphertext; the private key never leaves the owner. A second copy of the same ciphertext goes to a Backblaze B2 bucket outside GitHub, where Object Lock makes each file undeletable for 90 days, even by the key that uploads it. A restore drill restores a backup into a throwaway database and checks it against the audit anchors, proving it is complete and unaltered | `.github/workflows/backup.yml`, `infra/b2-upload.py`, `infra/restore-drill.sh` |
| Personal data kept longer than needed | Expired sessions are deleted, and invites and password resets a week after they are used or expire, on the first successful login each hour; the audit log keeps the permanent record | `internal/prune/` |
| CSRF | `SameSite=Lax` on the session cookie, kept first-party in production by serving the API through the frontend's own address | `internal/auth/handler.go`, `frontend/functions/api/` |
| Bypassing the proxy | The API answers only requests carrying the secret the proxy adds, compared in constant time; Terraform generates it, so no person handles it. It can be rotated without refusing anyone: for the minutes the switch takes, the API also accepts the previous secret and marks each request that used it in the request log | `main.go`, `infra/api.tf` |
| Spoofed visitor address | The forwarded address is trusted only on requests that passed the secret check, and parsed before it reaches the audit log; the proxy overwrites any value the browser sent | `internal/audit/audit.go`, `frontend/functions/api/` |
| Over-privileged deploy credentials | Each provider token is scoped to this project; CI's Cloudflare token sits in a GitHub environment only `main` can use; the audit check connects as a role that can only read the audit log | `infra/`, `.github/workflows/` |
| Unknown code in production | The API runs an image pinned by commit, scanned before it is pushed and carrying a signed build provenance attestation | `infra/api-image-tag.txt`, `.github/workflows/publish.yml` |
| Cleartext session cookie | `Secure` flag driven by the `SECURE_COOKIES` environment variable | `main.go` |
| Mass assignment | Strict JSON decoding with unknown fields rejected, and no client supplied owner or status on create | `internal/incident/handler.go` |
| Oversized request bodies | `MaxBytesReader` caps every JSON body at 1 MiB | `internal/incident/handler.go` |
| Internal error disclosure | Generic client messages, real errors logged server side | all handlers |
| Overly open CORS | One named origin with credentials, never a wildcard | `main.go` |
| Malformed identifiers reaching the database | Path parameters are shape checked before any query runs | `internal/incident/handler.go` |
| Known-vulnerable dependencies | `govulncheck` fails on any vulnerability the code actually calls; `npm audit` fails on fixable high or critical advisories; Dependabot alerts track both | `.github/workflows/security.yml` |
| Known-vulnerable base images | Trivy scans both images and fails on fixable high or critical findings; the frontend image installs Alpine's fixes at build time | `.github/workflows/security.yml`, `frontend/Dockerfile` |
| Exploitable code patterns | CodeQL static analysis of the Go and TypeScript code on every pull request | `.github/workflows/security.yml` |
| Production suspended by an exhausted free allowance | All free Render services share 750 hours a month, and production alone uses up to 744; a weekly check projects the worst case from the service list and fails, emailing the owner, if a second free service could exhaust it | `.github/workflows/render-hours.yml`, `infra/render-hours.sh` |
| Misconfiguration of the live site | Every Monday, OWASP ZAP's baseline scan crawls the live site and checks every response passively, never attacking it; any finding of Medium risk or above fails the run and emails the owner, unless it is triaged with a written reason. Its findings led to a CSP without `'unsafe-inline'`, HSTS, no wildcard CORS on static files, a `Permissions-Policy`, and cross-origin isolation | `.github/workflows/zap-baseline.yml`, `.zap/`, `frontend/public/_headers` |
| Leaked credentials | Push protection rejects a push containing a recognised secret, and gitleaks scans the full history | GitHub settings, `.github/workflows/security.yml` |
| Tampered CI dependencies | Every GitHub Action is pinned to a full commit SHA, and downloaded tools are checksum-verified before they run | `.github/workflows/` |

### Known gaps

Listed openly, because a portfolio that hides its weak spots is not worth much.

- The frontend's tests run in jsdom, so they check behaviour, focus and wording but not
  layout or real rendering; those were checked by hand in a browser. The API's behaviour,
  including its security controls, is covered by integration tests that run on every pull request.
- The audit log is tamper evident, not tamper proof. A database superuser can drop the
  triggers and rebuild the whole hash chain. The scheduled anchor check catches any rebuild
  that reaches back before the last anchor, but entries written since the last run, at most
  about 6 hours, could still be rewritten undetected.
- Authentication events are recorded on a best-effort basis, unlike role changes, which
  are transactional. A failed audit write is logged but does not fail the login.
- The free API sleeps after 15 idle minutes, and the first request after that gets Render's
  502 page for up to a minute while it wakes.
- There is no email, so an admin hands reset links over by hand. If the only admin forgets
  their password, the link comes from the command line instead (`go run . reset-password`), which
  needs the database login.
- Render's Terraform provider cannot update free-plan services, so new API images are
  deployed with `infra/deploy-api.sh` until an upstream fix ships.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Go with the standard library `net/http` | No framework, so the request lifecycle stays visible |
| Data access | `database/sql` with the pgx driver, hand written SQL | No ORM hiding the database |
| Database | PostgreSQL 17 in Docker, bound to localhost | Matches the managed Postgres it will deploy onto |
| Migrations | golang-migrate, SQL embedded with `go:embed` | Versioned schema, one explicit `migrate` subcommand |
| Frontend | React 19, Vite, TypeScript, plain CSS tokens, Motion, Vitest | Fast dev loop, typed API boundary, a design system that fits a strict CSP ([ADR 0001](docs/adr/0001-frontend-design-system.md)) |
| Auth | Server side sessions, bcrypt, `HttpOnly` cookie | Instant revocation, and it teaches cookie security properly |
| Config | 12 factor environment variables, git ignored `.env` | Secrets never reach the repository |
| Containers | Multi-stage builds: distroless for the API, `nginx-unprivileged` for the frontend | Small, non-root images with no shell in the API image |
| Hosting | Cloudflare Pages, Render, and Neon, all on free plans in Singapore | A real public deployment with no card on file |
| Infrastructure as code | Terraform 1.17, run from HashiCorp's image, state in its own Neon database | Every resource reviewable as a plan before it changes |

## Quickstart

You need a container runtime, Go 1.26 or newer, Node.js with npm, and git.

```bash
git clone https://github.com/rehrabbi/SentinelOps.git
cd SentinelOps
cp .env.example .env          # then set POSTGRES_PASSWORD to anything URL safe
```

```bash
colima start                  # macOS only, starts the container VM
docker compose up -d          # Postgres 17 on 127.0.0.1:5432
```

```bash
cd backend
set -a; . ../.env; set +a
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}?sslmode=disable"
go run . migrate              # apply migrations
go run .                      # API on :8080
```

```bash
cd frontend
npm install && npm run dev    # UI on :5173
```

There is no open sign-up: accounts come from one-time invites. The database lives in a
local Docker volume and does not travel with the repository, so every machine starts
empty, and the first admin's invite comes from the command line, which needs database
access rather than an admin session:

```bash
cd backend && go run . invite --email you@example.com --role admin --site http://localhost:5173
```

Open the printed link, choose your name and password, and you are in as an admin. From the
admin screen you can invite anyone else, as a reporter, analyst, or admin.

Three optional variables all have working local defaults. `FRONTEND_ORIGIN` defaults to
`http://localhost:5173`, and `SECURE_COOKIES` defaults to `false`, which must become
`true` in production or the session cookie travels in cleartext. `PROXY_SECRET` is unset
locally; in production it must hold the secret the proxy sends, or the API can be reached
around the proxy.

Check the audit log's integrity at any time. It exits non-zero when the chain is broken,
so it suits a scheduled job.

```bash
cd backend && go run . verify-audit
```

The frontend has its own tests (Vitest and Testing Library). CI runs them on every pull
request, and `npm run lint` and `npm run build` (which type-checks first) run beside them:

```bash
cd frontend && npm test
```

### Or run the whole stack in containers

The same `.env` is all the containerized stack needs. The `app` profile builds both images,
waits for Postgres, runs migrations as a one-shot job, starts the API once that job has
succeeded, and starts the frontend once the API reports healthy.

```bash
docker compose --profile app up -d --build   # UI on :8081, API on :8080
docker compose --profile app ps              # migrate should show Exited (0), api (healthy)
docker compose --profile app down            # stop it again
```

Open `http://localhost:8081`. Everything is published on `127.0.0.1` only. Plain
`docker compose up -d` still starts just the database, so the native workflow above is
unchanged; stop the containerized API before running `go run .`, since both use port 8080.
Run any subcommand against the containerized database from the same image, for example
`docker compose --profile app run --rm --no-deps api verify-audit`.

Per device setup notes, including the macOS and Colima path, live in
[docs/PROJECT-STATE.md](docs/PROJECT-STATE.md).

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/healthz` | none | Liveness |
| `GET` | `/readyz` | none | Readiness, including a database ping |
| `GET` | `/api/healthz` | proxy secret | Liveness through the site's proxy, for uptime monitoring; never touches the database |
| `POST` | `/api/invites` | cookie, admin only | Issue a one-time invite; returns its token once |
| `POST` | `/api/invites/accept` | the invite token | Create the invited account, returns `201` |
| `GET` | `/api/users` | cookie, admin only | List users |
| `PATCH` | `/api/users/{id}` | cookie, admin only | Change a user's role, never your own |
| `POST` | `/api/sessions` | none | Log in, sets the session cookie |
| `DELETE` | `/api/sessions/current` | cookie | Log out, idempotent |
| `DELETE` | `/api/sessions` | cookie | Log out everywhere: end every session of the caller |
| `GET` | `/api/me` | cookie | The authenticated user |
| `PUT` | `/api/me/password` | cookie | Change your password; needs the current one, ends your other sessions |
| `POST` | `/api/users/{id}/password-reset` | cookie, admin only | Issue a one-time reset link for another user; returns its token once |
| `POST` | `/api/password-resets/accept` | the reset token | Set a new password; ends every session of that account |
| `POST` | `/api/incidents` | cookie | Create, owner is the caller and status starts `open` |
| `GET` | `/api/incidents` | cookie | List, scoped by role |
| `GET` | `/api/incidents/{id}` | cookie | Read one, scoped by owner and role |
| `PATCH` | `/api/incidents/{id}` | cookie | Partial update, scoped by owner and role |

## Repository layout

```
SentinelOps/
├─ backend/
│  ├─ Dockerfile                     multi-stage build to a distroless, non-root image
│  ├─ main.go, db.go, migrate.go     entry point, pool, migration runner
│  ├─ server.go                      every route and middleware, shared with the tests
│  ├─ integration_test.go            the API end to end against a throwaway Postgres
│  ├─ migrations/                    versioned SQL, currently at version 5
│  └─ internal/
│     ├─ user/                       model, repository, handler, validation, role changes
│     ├─ session/                    token generation, hashing, lookup
│     ├─ auth/                       login, logout, me, RequireAuth and RequireRole
│     ├─ authctx/                    the authenticated caller, carried in the request context
│     ├─ audit/                      append-only, hash-chained audit entries
│     ├─ reqlog/                     one structured log line per request
│     └─ incident/                   incident domain and per-object authorization
├─ frontend/
│  ├─ Dockerfile, nginx.conf.template  Vite build served by unprivileged nginx with a CSP
│  ├─ functions/api/                 Cloudflare proxy that forwards /api to the API
│  ├─ public/_headers                security headers when served by Cloudflare Pages
│  └─ src/                           React app, api.ts is the typed API client
├─ docs/                             working agreement, project state, learning log
├─ infra/                            Terraform for Neon, Render and Pages; terraform.sh,
│                                    migrate.sh, deploy-api.sh, restore-drill.sh, rotation
│                                    scripts; the pinned
│                                    API image tag and the backups' public key
├─ .github/workflows/                CI and security scans on every pull request; publish,
│                                    deploy frontend, nightly encrypted backups, and the
│                                    6-hourly audit verification
├─ CHANGELOG.md                      every release, in Keep a Changelog format
└─ compose.yaml                      Postgres by default; migrate, api, and web with --profile app
```

## How this project is built

Work follows GitHub Flow, run the way a team would run it.

- **Issues first.** Every feature, fix, and stage starts as a GitHub issue, labelled by
  type, area, and priority, and grouped into a milestone per roadmap stage.
- **Typed branches.** Each change lives on a short-lived branch named for its type,
  `feat/`, `fix/`, `docs/`, `build/`, `ci/`, `refactor/`, or `chore/`, matching the
  conventional commit types used in its commit messages.
- **Protected `main`.** It changes only through a pull request, and nine required checks,
  covering build, lint, tests, Terraform, dependency, code, image, and secret scanning, must pass on a
  branch that is up to date with `main` before anything merges, administrators included.
- **Merge commits only.** Every commit keeps its hash on `main`, and each merge commit
  carries the pull request's full write-up, so the reasoning behind a change is in
  `git log` itself.
- **Nothing is deleted.** Merged branches are archived under `merged/`, so the full history
  of each piece of work stays in the repository.
- **Versioned releases.** Each finished stage is tagged as a minor release and described
  in the [changelog](CHANGELOG.md). `1.0.0` is reserved for the first hardened production
  deployment.

The full contract is in [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/WAYS-OF-WORKING.md](docs/WAYS-OF-WORKING.md).

## Roadmap

**v0.1.0, released.** Health and readiness, Postgres and migrations, user registration,
login with sessions, auth middleware, logout, the React auth UI, the incident domain with
RBAC, the incident dashboard, per-object authorization on read and update, role
management behind an admin only screen, and a tamper-evident audit log.

**v0.2.0, released.** Containerization: multi-stage images for the API and the frontend,
and the whole stack running in Compose, with migrations as a one-shot job.

**v0.3.0, released.** CI hardening: dependency, static analysis, image, and secret scanning
on every pull request, all required to pass, with results in the repository's Security tab.

**v0.4.0, released.** Free cloud deployment, live at
[sentinelops.pages.dev](https://sentinelops.pages.dev): Cloudflare Pages, Render and Neon
declared in Terraform, a same-origin proxy for the API, published and attested images, and the
audit chain anchored outside the database every 6 hours. AWS was the original target, but its
free plan now ends after six months and may require a card.

**v0.5.0, released.** Harden the live app: integration tests against Postgres on every pull
request, login rate limiting keyed on the proxy-verified visitor, invite-only accounts that close
account enumeration, and pruning of expired sessions and spent invites.

**v0.6.0, released.** Observe and recover: encrypted nightly backups with a restore drill checked
against the audit anchors, one structured log line per request, uptime alerts through the proxy, and
a runbook with its rotation procedure exercised.

**v1.0.0, released.** Hardening review: password change, "log out everywhere", admin and command-line
reset links; `PROXY_SECRET` rotation without refusing anyone, exercised live; a weekly OWASP ZAP baseline
scan and the headers it led to; Node 24 actions, schedules that cannot pause, a Render hours check, and
a second backup copy in Backblaze B2, locked for 90 days.

**v1.1.0, in progress.** The frontend redesign is built and merged on the `redesign` branch: a new
brand and logo, a public landing page and privacy notice, every screen redone, an incident overview
with charts, a light and dark theme, motion that respects reduced-motion settings, an accessibility
and performance pass, and 292 frontend tests. The API, database and authentication rules are
unchanged. What remains is a final review of the whole branch, then one pull request from
`redesign` into `main`, which deploys it. The tag follows that merge.

Deferred: `dev`, `staging`, and `prod` environments. Every free Render service shares 750
instance-hours a month and production already uses about 744, so a hosted staging environment would
put production at risk.

**What 1.0.0 promises.** From 1.0.0 on, versions follow semantic versioning: a major version for
anything that breaks the HTTP API or how the deployment is run (environment variables, manual
migration or deploy steps, the scripts' usage), a minor version for new features, and a patch for
fixes. The known gaps above are the honest list of what 1.0.0 does not do.

## Documentation

| File | What it holds |
|---|---|
| [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) | Where the project stands, every locked decision, the exact next step |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | What to do when production breaks: a failed audit check, a failed backup, restores, outages, leaked secrets |
| [docs/brand.md](docs/brand.md) | The brand guide: voice, logo, palette with contrast tables, type, motion |
| [docs/adr/0001-frontend-design-system.md](docs/adr/0001-frontend-design-system.md) | Why the frontend is built the way it is: tokens, CSP, accessibility, performance |
| [docs/learning-log.md](docs/learning-log.md) | Decisions and why, concepts, security and debugging lessons |
| [docs/WAYS-OF-WORKING.md](docs/WAYS-OF-WORKING.md) | The collaboration contract behind how this is built |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issues, branches, commits, pull requests, labels, and releases |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Expected behaviour and how to report a problem |

## License

[MIT](LICENSE)
