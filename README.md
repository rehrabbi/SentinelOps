# SentinelOps

> A production-style, cloud-native **secure incident & ticket management platform** —
> built as a hands-on learning project to master the *engineering around* a SaaS app:
> backend, frontend, databases, authentication, authorization, application security,
> Docker, CI/CD, infrastructure-as-code, AWS, and observability.

**Status:** 🚧 In active development — **login works end-to-end**; next up is the auth
middleware that protects routes. This is a learning-in-public portfolio project; the git
history is meant to read as a clear, incremental engineering story.

---

## 📖 Start here (especially on a new device)

This project is built through an **interactive engineering apprenticeship** with an AI
mentor. How we work and where we are is documented — read these in order:

1. **[CLAUDE.md](CLAUDE.md)** — the short operating manual for an AI assistant working on
   this repo (mentor, not autonomous builder). *(Read first.)*
2. **[docs/WAYS-OF-WORKING.md](docs/WAYS-OF-WORKING.md)** — the collaboration contract:
   my preferences, the locked rules, decision protocol, and approval gates. The
   authoritative detail behind `CLAUDE.md`.
3. **[docs/PROJECT-STATE.md](docs/PROJECT-STATE.md)** — current state, every decision made,
   the **exact next step**, and per-device environment setup (§9).
4. **[docs/learning-log.md](docs/learning-log.md)** — the detailed history of decisions
   and lessons learned.

> **Resuming on another device?** Clone the repo, then tell the AI:
> *"Read docs/WAYS-OF-WORKING.md and docs/PROJECT-STATE.md, then re-orient and continue."*
> Everything needed to continue seamlessly is in those files (the AI's local memory does
> not travel between devices — the docs are the source of truth).

---

## 🏗️ Target architecture (the goal we're building toward)

```
                 INTERNET
                    │
                    ▼
              CDN / WAF
                    │
                    ▼
             Load Balancer
                    │
                    ▼
        ┌────────────────────┐
        │  Dockerized App    │
        │  Frontend + API    │
        └─────────┬──────────┘
                  │
                  ▼
          PostgreSQL / RDS

  GitHub → GitHub Actions → (tests, SAST, dependency/secret/container scanning,
           Docker build, deploy) → AWS  ◄── Terraform
```

Every component is introduced only when a real problem justifies it — no complexity for
its own sake. AWS Well-Architected pillars (Operational Excellence, Security,
Reliability, Performance, Cost, Sustainability) guide decisions.

---

## 🧱 Tech stack (all free)

| Layer | Choice |
|---|---|
| Backend | **Go** — standard-library `net/http` (no framework) |
| Data access | **`database/sql` + pgx** — hand-written SQL, **no ORM** |
| Database | **PostgreSQL 17** (Docker for local dev) |
| Migrations | **golang-migrate** (embedded SQL) |
| Frontend | **React + Vite + TypeScript** |
| Auth | Server-side sessions, HttpOnly cookie, bcrypt passwords |
| Config | 12-factor env vars; git-ignored `.env` (+ committed `.env.example`) |

See [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) for the reasoning behind each choice.

---

## 📂 Repository layout

```
SentinelOps/
├─ backend/
│  ├─ main.go, db.go, migrate.go        # entry point, DB pool, migrations
│  ├─ migrations/                       # versioned SQL (users, sessions)
│  └─ internal/
│     ├─ user/                          # user model, repository, handler, validation
│     ├─ session/                       # session model + repository (token gen)
│     └─ auth/                          # login handler (middleware + logout next)
├─ frontend/                            # React + Vite + TS app
├─ docs/                                # ways-of-working, project-state, learning-log
├─ compose.yaml                         # Postgres 17 (localhost-only, healthchecked)
├─ .env.example                         # config template (real .env is git-ignored)
├─ CLAUDE.md                            # AI-assistant working agreement
└─ README.md
```

---

## ▶️ Run it locally

Prerequisites: **a container runtime, Go 1.26+ (go.mod requires 1.26.5), Node.js + npm,
git**. Create a root-level `.env` from `.env.example` (holds Postgres credentials; never
committed). Per-device setup — including the macOS/Colima path — is in
**[docs/PROJECT-STATE.md §9](docs/PROJECT-STATE.md)**.

```bash
# From the repo root
colima start                   # macOS only: start the container VM
docker compose up -d           # start Postgres

# From backend/ — build DATABASE_URL from .env without printing the password
set -a; . ../.env; set +a
export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}?sslmode=disable"
go run . migrate               # apply DB migrations
go run .                       # start the API on :8080

# From frontend/
npm install && npm run dev     # start the UI on :5173
```

Health checks: `GET /healthz` (liveness), `GET /readyz` (DB readiness).
API so far: `GET /api/users`, `POST /api/users` (register), `POST /api/sessions` (login).

Optional env vars, both with working local defaults: `FRONTEND_ORIGIN`
(default `http://localhost:5173`) and `SECURE_COOKIES` (default `false` — **must be `true`
in production**, or the session cookie travels in cleartext).

> **Note:** the database lives in a local Docker volume and does **not** travel with the
> repo. After cloning on a new machine, run the migrations and register your own test user.

---

## 🔐 Security focus

Security is a first-class goal, not an afterthought. Implemented so far: parameterized
SQL (SQLi defense), bcrypt password hashing, strict JSON parsing (mass-assignment
defense), request size caps, generic error responses (no info leak), least-privilege
CORS (one named origin, never `*`, as required alongside credentialed requests),
SHA-256-hashed session tokens at rest, `HttpOnly` + `SameSite=Lax` + environment-driven
`Secure` cookies (XSS/CSRF defense), and constant-ish login timing so a missing account
can't be distinguished from a wrong password. Each control is documented with the threat
it addresses in [docs/learning-log.md](docs/learning-log.md).

**Known open item:** account enumeration is inconsistent — login resists it, but
registration still returns `409` on a duplicate email, which leaks the same fact
deliberately. Tracked in the learning log's "questions to revisit".

---

## 📍 Current state & next step

**Done:** health/readiness endpoints · Postgres in Docker · golang-migrate (schema v2) ·
users read + register APIs · session data layer · **login (`POST /api/sessions`) with
cookie-based sessions, verified 8/8 including timing and token-hashing properties**.

**Next:** **auth middleware** — read the session cookie, hash it, look up and validate the
session, attach the user to the request context, and protect a first route (likely
`GET /api/me`). Then logout (`DELETE /api/sessions/current`), then the frontend login form.

**Then:** authorization/RBAC → incident features → audit logging → automated tests → Docker
for the app → CI + security scanning → AWS via Terraform → observability.

The full decision list, acceptance criteria for the next step, and per-device setup notes
live in **[docs/PROJECT-STATE.md](docs/PROJECT-STATE.md)**.
