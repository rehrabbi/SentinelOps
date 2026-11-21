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
  <img src="docs/images/dashboard.png" alt="SentinelOps incident dashboard" width="700">
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

**Status:** the current release is [v0.1.0](https://github.com/rehrabbi/SentinelOps/releases/tag/v0.1.0).
In progress is [Containerization](https://github.com/rehrabbi/SentinelOps/milestone/1),
which will be released as v0.2.0. Every release is described in the [changelog](CHANGELOG.md).

**What works today**

- Registration and login with server side sessions in an `HttpOnly` cookie
- Role based access control across three roles, reporter, analyst, and admin, with an
  admin only user directory and an admin screen for changing roles
- An append-only, hash-chained audit log recording logins, failed logins, logouts,
  and role changes, with a command that verifies the chain
- Incident create, list, read, and partial update, each one scoped by owner and role
- A React dashboard with severity and status badges and inline status editing
- Health and readiness endpoints, versioned SQL migrations, Postgres in Docker
- The whole stack runnable in containers: a 20 MB distroless API image, an unprivileged
  nginx image for the frontend, and a Compose profile that runs migrations first

## Screens

| Sign in | Incident list |
|---|---|
| <img src="docs/images/login.png" alt="Login screen" width="380"> | <img src="docs/images/incident-list.png" alt="Incident list with severity and status badges" width="380"> |

<p align="center">
  <img src="docs/images/admin-roles.png" alt="Admin screen for changing user roles" width="620">
</p>

<p align="center"><em>The admin screen. Your own row is locked, because an admin may not change their own role.</em></p>

## Architecture

Today the application runs as a Go API and a React client against Postgres, either
natively for development or as two images, one for the API and one serving the built
frontend, the same split the target deployment uses.

```mermaid
flowchart LR
    B["Browser<br/>React + Vite + TS"]
    C["CORS<br/>one named origin"]
    R["RequireAuth<br/>cookie, session, user"]
    H["Handlers<br/>per-object authorization"]
    D[("PostgreSQL 17")]

    B -->|"JSON + session cookie"| C
    C --> R
    R --> H
    H -->|"parameterised SQL"| D
```

The target deployment, which the roadmap below works toward, adds the cloud and delivery
layers.

```mermaid
flowchart TB
    U["Internet"] --> W["CDN and WAF"]
    W --> LB["Load balancer"]
    LB --> APP["Containers<br/>frontend + API"]
    APP --> RDS[("Managed Postgres")]

    GH["GitHub"] --> CI["GitHub Actions<br/>build, vet, scan, image"]
    CI --> APP

    TF["Terraform"] -.-> W
    TF -.-> LB
    TF -.-> APP
    TF -.-> RDS
```

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
| Covering tracks | The audit log refuses `UPDATE`, `DELETE` and `TRUNCATE`, and every row is SHA-256 chained to its predecessor by a database trigger, so edits are detectable with `go run . verify-audit` | `migrations/000005_create_audit_log.up.sql` |
| An unrecorded privileged action | A role change and its audit entry share one transaction, so if the entry cannot be written the change is rolled back | `internal/user/handler.go` |
| Weak password storage | bcrypt, with a 12 character minimum and no composition rules, following NIST 800-63B | `internal/user/validate.go` |
| Account enumeration by timing | An unknown email still runs a bcrypt compare against a dummy hash, so both failures cost the same | `internal/auth/handler.go` |
| Session theft through XSS | Opaque 256 bit token in an `HttpOnly` cookie, never readable by JavaScript | `internal/auth/handler.go` |
| Session theft at rest | Only the SHA-256 hash of the token is stored, so a database leak yields nothing usable | `internal/session/repository.go` |
| CSRF | `SameSite=Lax` on the session cookie | `internal/auth/handler.go` |
| Cleartext session cookie | `Secure` flag driven by the `SECURE_COOKIES` environment variable | `main.go` |
| Mass assignment | Strict JSON decoding with unknown fields rejected, and no client supplied owner or status on create | `internal/incident/handler.go` |
| Oversized request bodies | `MaxBytesReader` caps every JSON body at 1 MiB | `internal/incident/handler.go` |
| Internal error disclosure | Generic client messages, real errors logged server side | all handlers |
| Overly open CORS | One named origin with credentials, never a wildcard | `main.go` |
| Malformed identifiers reaching the database | Path parameters are shape checked before any query runs | `internal/incident/handler.go` |

### Known gaps

Listed openly, because a portfolio that hides its weak spots is not worth much.

- Registration returns `409` on a duplicate email, which leaks whether an account exists.
  Login resists enumeration, so the two endpoints disagree.
- No rate limiting, so login is open to brute force attempts.
- Expired session rows are never pruned, so the table grows without bound.
- No automated test suite yet. Verification so far is scripted `curl` runs and manual
  browser checks, both recorded in the learning log.
- The audit log is tamper evident, not tamper proof. A database superuser can drop the
  triggers and rebuild the whole hash chain. Closing that means recording the head hash
  outside this database, which is planned alongside deployment.
- Authentication events are recorded on a best-effort basis, unlike role changes, which
  are transactional. A failed audit write is logged but does not fail the login.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Go with the standard library `net/http` | No framework, so the request lifecycle stays visible |
| Data access | `database/sql` with the pgx driver, hand written SQL | No ORM hiding the database |
| Database | PostgreSQL 17 in Docker, bound to localhost | Matches the managed Postgres it will deploy onto |
| Migrations | golang-migrate, SQL embedded with `go:embed` | Versioned schema, one explicit `migrate` subcommand |
| Frontend | React 19, Vite, TypeScript | Fast dev loop, typed API boundary |
| Auth | Server side sessions, bcrypt, `HttpOnly` cookie | Instant revocation, and it teaches cookie security properly |
| Config | 12 factor environment variables, git ignored `.env` | Secrets never reach the repository |
| Containers | Multi-stage builds: distroless for the API, `nginx-unprivileged` for the frontend | Small, non-root images with no shell in the API image |

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

Register a user at `http://localhost:5173`, then file an incident. The database lives in a
local Docker volume and does not travel with the repository, so every machine starts
empty. Promote yourself to analyst with
`UPDATE users SET role='analyst' WHERE email='you@example.com';` to see every incident
rather than only your own.

The first admin has to be created the same way, with
`UPDATE users SET role='admin' WHERE email='you@example.com';`. Nothing in the
application can do it, because the admin screen is itself admin only. That is deliberate,
and it holds in production too.

Two optional variables both have working local defaults. `FRONTEND_ORIGIN` defaults to
`http://localhost:5173`, and `SECURE_COOKIES` defaults to `false`, which must become
`true` in production or the session cookie travels in cleartext.

Check the audit log's integrity at any time. It exits non-zero when the chain is broken,
so it suits a scheduled job.

```bash
cd backend && go run . verify-audit
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
| `POST` | `/api/users` | none | Register, returns `201` |
| `GET` | `/api/users` | cookie, admin only | List users |
| `PATCH` | `/api/users/{id}` | cookie, admin only | Change a user's role, never your own |
| `POST` | `/api/sessions` | none | Log in, sets the session cookie |
| `DELETE` | `/api/sessions/current` | cookie | Log out, idempotent |
| `GET` | `/api/me` | cookie | The authenticated user |
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
│  ├─ migrations/                    versioned SQL, currently at version 5
│  └─ internal/
│     ├─ user/                       model, repository, handler, validation, role changes
│     ├─ session/                    token generation, hashing, lookup
│     ├─ auth/                       login, logout, me, RequireAuth and RequireRole
│     ├─ authctx/                    the authenticated caller, carried in the request context
│     ├─ audit/                      append-only, hash-chained audit entries
│     └─ incident/                   incident domain and per-object authorization
├─ frontend/
│  ├─ Dockerfile, nginx.conf.template  Vite build served by unprivileged nginx with a CSP
│  └─ src/                           React app, api.ts is the typed API client
├─ docs/                             working agreement, project state, learning log
├─ .github/workflows/ci.yml          format, vet, build, test, lint on every pull request
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
- **Protected `main`.** It changes only through a pull request, and both CI jobs must pass
  on a branch that is up to date with `main` before anything merges, administrators
  included.
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

Next up, each stage ending in a minor release.

1. **Containerization, v0.2.0, in progress.** Multi-stage images for the API and the
   frontend, and the whole stack running in Compose
2. CI hardening with dependency, secret, and static analysis scanning, plus a scheduled
   `verify-audit` run and somewhere outside the database to anchor the chain head
3. AWS architecture provisioned with Terraform, then `dev`, `staging`, and `prod`
   environment branches once there is somewhere to deploy
4. Observability, alerting, backups, and a cost review

**1.0.0** is the first hardened production deployment on AWS.

## Documentation

| File | What it holds |
|---|---|
| [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) | Where the project stands, every locked decision, the exact next step |
| [docs/learning-log.md](docs/learning-log.md) | Decisions and why, concepts, security and debugging lessons |
| [docs/WAYS-OF-WORKING.md](docs/WAYS-OF-WORKING.md) | The collaboration contract behind how this is built |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issues, branches, commits, pull requests, labels, and releases |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Expected behaviour and how to report a problem |

## License

[MIT](LICENSE)
