# SentinelOps — Learning Log

A running record of the decisions we make, *why* we made them, and what was learned.
Written to be useful later for a portfolio README, interviews, and my own memory.

Format: newest decisions at the bottom. Each entry = What we decided → Why → What I learned.

---

## Stage 0 — Goals & Constraints

**Project:** SentinelOps — a secure incident & ticket management SaaS, built as a vehicle to
learn the engineering *around* an application (security, cloud, CI/CD, IaC, observability),
not just CRUD features.

**Constraints:**
- Everything used must be **free** (no paid tiers, no card-required trials). Any potential
  cost must be flagged *before* it is incurred.
- Solo learner, currently **new to most** of the stack (frontend frameworks, Docker, AWS).
- **Steady** pace (~5–10 hrs/week), treated as a marathon.
- Learning method: teach → decide → design → small implementation → read together → test →
  verify → reflect → commit → next. No silent decisions.

**Definition of success:** I can *explain* how the whole system works and why it was built
this way — architecture, boundaries, security threats & controls, containers, CI/CD, IaC,
cloud routing, monitoring, failure handling, scaling, and cost.

---

## Decision 1 — Build & Delivery Strategy

**Decided:** Walking Skeleton (thin end-to-end vertical slice first, then widen).

**Why:** The goal is the engineering *around* the app. A walking skeleton wires one tiny
feature through frontend → API → database (and later Docker → CI → cloud) early, so DevOps
and security are learned continuously instead of crammed at the end. It also de-risks the
"does it all connect?" moment by facing it early and small.

**Alternatives considered:** Feature-First (build app, then add infra later) and
Infra-First (build cloud scaffolding before the app). Rejected because both hide or defer
exactly the concepts I most want to learn.

**What I learned:** Build *order* is itself an engineering decision. "Make it work
end-to-end, tiny, then grow it" is a core senior instinct.

---

## Decision 2 — Application Architecture Shape

**Decided:** Separated frontend + backend API (two apps that talk over HTTP/JSON),
kept together in **one repository**.

**Why:** The client/server boundary — the line between the untrusted browser and the
trusted server — is where most web security lives (IDOR, broken auth, XSS, CORS, token
handling). Separating frontend and backend makes that boundary a *visible network call*
I can inspect, break, and defend. One repo keeps the setup overhead low while still
teaching the separation.

**Alternatives considered:** Integrated full-stack framework (one app does UI + API) and
classic server-rendered monolith. Both are simpler but hide the boundary and the modern
SaaS/security lessons.

**Key concept learned:** Frontend = untrusted (runs in the user's browser, fully
tamperable). Backend = trusted (enforces the rules). Never trust the client.

---

## Decision 3 — Language Strategy

**Decided:** Go backend + TypeScript/React frontend (two languages).

**Why:** Go is the dominant cloud-native language (Docker, Kubernetes, and much of the
infra tooling I'll meet later are written in it), it's fast, and it compiles to small,
simple container images that will keep the Docker/AWS stages clean. I chose it knowing it's
the steeper learning curve — the payoff is a stronger cloud-native skill set and portfolio.

**Alternatives considered:** TypeScript everywhere (lowest cognitive load, mentor's
recommendation) and Python + TS. Chose Go deliberately for the cloud-native depth, accepting
a slower ramp and a second language to learn.

**What I learned:** The frontend must be JS/TS because that's what browsers run; TypeScript
is JS plus a compile-time type-checker that catches a class of bugs before runtime. The
backend language is the real choice, and it trades cognitive load against ecosystem fit.

---

## Decision 4 — Frontend Framework

**Decided:** React (with Vite as the dev/build tool).

**Why:** As a beginner, the deciding factor is how many tutorials and answers exist when
stuck — React has the largest ecosystem and community by far, plus the strongest
job-market/portfolio signal. Vite gives fast reloads in dev and bundles for production.

**Alternatives considered:** Vue (gentlest on-ramp, smaller ecosystem) and Svelte (simplest
model, smallest community). Chose React for support volume and portfolio value.

**What I learned:** A frontend framework provides a component model (reusable UI pieces) and
safe-by-default rendering (helps prevent XSS), versus hand-writing DOM updates in vanilla JS.
Because we chose a separated architecture, the frontend is a standalone SPA that calls the
Go API over HTTP — which is why Next.js (integrated full-stack) was out of scope.

---

## Decision 5 — Go Backend Framework

**Decided:** Standard library `net/http` (no framework to start). Add a thin router (`chi`)
later, only if/when hand-rolled routing becomes painful.

**Why:** The goal is to understand the request lifecycle — routing, middleware, handlers —
not have it hidden. `net/http` shows exactly how a request becomes a response, is fully
production-capable, and adds zero extra dependencies to trust and security-scan. Introducing
`chi` later becomes a deliberate "add complexity only when a real need appears" lesson.

**Alternatives considered:** `chi` (thin transparent router now) and `Gin`/`Echo` (full
frameworks, most examples but most magic). Chose stdlib-first for maximum understanding.

**What I learned:** Go compiles to a single static binary (tiny containers later), is
statically typed, and ships a production-grade HTTP server in its standard library — so a
web framework is optional, not required. "Routing" = matching a URL+method to code;
"middleware" = shared logic (e.g. auth) that runs around handlers.

---

## Decision 6 — Database Engine

**Decided:** PostgreSQL, run locally in Docker.

**Why:** It's the standard for multi-user SaaS, has the richest security features (strong
constraints, row-level security) which suits this project's security focus, and maps exactly
to AWS RDS for PostgreSQL so nothing learned is wasted. Running it in Docker doubles as the
first hands-on taste of containers.

**Alternatives considered:** MySQL/MariaDB (good, slightly fewer advanced/security features)
and SQLite (single-file, great for learning but single-writer and not production-representative
for a concurrent SaaS).

**What I learned:** Relational DBs store data in typed tables that relate via keys, queried
with SQL; they fit an incident/ticket system because it's relationship-heavy and needs
consistency (e.g. never lose an audit trail). NoSQL/document stores trade structure for
flexibility — wrong fit here.

---

## Decision 7 — Package Managers

**Decided:** npm for the frontend (Node ecosystem). Go modules (`go mod`) for the backend —
built into Go, no choice required.

**Why:** npm ships with Node, needs no extra install, and matches virtually every tutorial —
the right call while still learning. pnpm (faster, stricter) is a good future upgrade.

**What I learned:** A package manager installs reusable libraries, pins exact versions in a
lockfile for reproducible builds, and is where dependency-vulnerability scanning hooks into
CI later.

---

## Decision 8 — Repository Layout

**Decided:** Single repo ("monorepo") with a clear top-level split:
`frontend/` (React) · `backend/` (Go) · `docs/` · (`infra/` for Terraform later).

**Why:** Mirrors the separated architecture, keeps frontend and backend as equal peers
(both are being learned), and sets up clean per-app Dockerfiles and CI jobs later. The Go
code stays idiomatic inside `backend/`.

**Alternatives considered:** Go-rooted layout (Go at repo root, frontend in `web/`) —
rejected because it quietly demotes the frontend and fits the separated architecture awkwardly.

**What I learned:** Repo layout drives how Docker builds (one Dockerfile per app folder) and
how CI splits into per-app jobs — it's structural, not just cosmetic.

---

## Full Stack (as of Stage 3)
Walking Skeleton · Separated FE+API in one monorepo · React+Vite+TypeScript frontend ·
Go (`net/http`) backend · PostgreSQL (Docker) · npm + go modules · top-level folder split.

---

## Stage 5 — Development Environment

**Set up / verified:** git 2.49, Node.js v24.18 + npm 11.16, Docker 29.6 (client), and Go
1.26.5 (newly installed). All free.

**How Go got installed (a debugging lesson worth keeping):**
- `winget install GoLang.Go` downloaded Go but the install never completed. First attempt
  failed because winget's `msstore` source had a TLS certificate error — fixed by adding
  `--source winget`.
- Even then, the install silently stopped after "Downloading". Root cause found in the MSI
  verbose log (`msiexec /i ... /l*v log.txt` → search for `Return value 3`):
  **Error 1925 — insufficient privileges**. The shell subprocess does NOT run with an
  elevated admin token (confirmed: `IsInRole(Administrator) = False`), so any install into
  `C:\Program Files` fails with MSI error **1603**.
- A separate red herring: PowerShell 5.1's `Invoke-WebRequest` hung indefinitely (0 bytes
  after 7 min). `curl.exe` (native on Win11) downloaded the same file in ~10s. Lesson:
  prefer `curl.exe` over `Invoke-WebRequest` on Windows for large downloads.
- **Final working method:** the portable Go **ZIP**, extracted to
  `C:\Users\Jireh\AppData\Local\Programs\Go` (a user-writable location, no admin needed) and
  added to the **user** PATH via `[Environment]::SetEnvironmentVariable('Path', ..., 'User')`.

**What I learned:**
- Windows MSI error **1603** is generic; the real reason lives in the verbose install log.
  Error **1925** specifically = not elevated.
- "Admin token" is not the same as "launched as admin" — a subprocess can silently lack it.
- Installing a tool for the current user only (unzip to a profile folder + user PATH) avoids
  the whole elevation problem — a legitimate, admin-free install strategy.
- PATH has scopes (Machine vs User); new/refreshed processes pick up changes, already-running
  ones keep the old value until restarted.

**Go facts noted:** compiles to a single binary; `GOPATH` = `C:\Users\Jireh\go`;
`go version` / `go env` inspect the toolchain.

---

## Questions to revisit later
- Revisit if the Go learning curve slows the security/cloud learning too much (fallback:
  a TypeScript/Node backend). Decided against for now in favor of cloud-native depth.
