# SentinelOps

> A production-style, cloud-native **secure incident & ticket management platform** —
> built as a hands-on learning project to master the *engineering around* a SaaS app:
> backend, frontend, databases, authentication, authorization, application security,
> Docker, CI/CD, infrastructure-as-code, AWS, and observability.

**Status:** 🚧 In active development — currently building **authentication (login)**.
This is a learning-in-public portfolio project; the git history is meant to read as a
clear, incremental engineering story.

---

## 📖 Start here (especially on a new device)

This project is built through an **interactive engineering apprenticeship** with an AI
mentor. How we work and where we are is documented — read these in order:

1. **[docs/WAYS-OF-WORKING.md](docs/WAYS-OF-WORKING.md)** — the collaboration contract:
   my preferences, the locked rules, decision protocol, and approval gates. *(Read first.)*
2. **[docs/PROJECT-STATE.md](docs/PROJECT-STATE.md)** — current state, every decision made,
   and the **exact next step** to continue.
3. **[docs/learning-log.md](docs/learning-log.md)** — the detailed history of decisions
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
│     └─ auth/                          # login/logout handlers (in progress)
├─ frontend/                            # React + Vite + TS app
├─ docs/                                # ways-of-working, project-state, learning-log
├─ compose.yaml                         # Postgres 17 (localhost-only, healthchecked)
├─ .env.example                         # config template (real .env is git-ignored)
└─ README.md
```

---

## ▶️ Run it locally

Prerequisites: **Docker Desktop, Go 1.26+, Node.js + npm, git**. Create a `backend`-level
`.env` from `.env.example` (holds Postgres credentials; never committed).

```bash
# From the repo root
docker compose up -d           # start Postgres

# From backend/ (with DATABASE_URL built from .env — see docs/PROJECT-STATE.md)
go run . migrate               # apply DB migrations
go run .                       # start the API on :8080

# From frontend/
npm install && npm run dev     # start the UI on :5173
```

Health checks: `GET /healthz` (liveness), `GET /readyz` (DB readiness).
API so far: `GET /api/users`, `POST /api/users` (register). Login (`POST /api/sessions`)
is being built.

---

## 🔐 Security focus

Security is a first-class goal, not an afterthought. Implemented so far: parameterized
SQL (SQLi defense), bcrypt password hashing, strict JSON parsing (mass-assignment
defense), request size caps, generic error responses (no info leak), least-privilege
CORS, and SHA-256-hashed session tokens at rest. Each control is documented with the
threat it addresses in [docs/learning-log.md](docs/learning-log.md).
