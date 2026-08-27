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

## Stage 6/7 — Backend Foundation (first rib of the walking skeleton)

**Built:** a minimal Go `net/http` server (`backend/main.go`, module `sentinelops`) exposing
a single `GET /healthz` endpoint that returns `{"status":"ok"}`. Compiles with `go build`;
verified via `curl` and browser (200 OK, JSON). `POST /healthz` returns `405 Method Not
Allowed` automatically — a free consequence of method-based routing.

**Version control:** `git init` (branch `main`); `.gitignore` excludes secrets (`.env`),
dependencies, and build output; first commit `ad2f220`. Confirmed `backend/bin/api.exe`
(build output) is correctly ignored.

**Concepts learned:**
- `http.NewServeMux` = router; the `"GET /healthz"` pattern (Go 1.22+) matches only that
  method+path, so wrong methods get `405` — an example of **least privilege / minimal
  attack surface**.
- Handler signature `(w http.ResponseWriter, r *http.Request)`; response write order is
  headers → status → body.
- `http.ListenAndServe` blocks forever; startup errors handled with `log.Fatalf`.
- `/healthz` is a real production **liveness** pattern (used later by Docker/LB/AWS).
- `.gitignore` is a security control (prevents accidental secret leakage).
- Conventional Commits format (`type: description`).

**Hardening deferred (on the radar, not yet fixed):**
- No server read/write timeouts (Slowloris DoS risk) → will switch to a configured
  `http.Server{}` later.
- `json.Encode` error is ignored → adopt a proper error-handling pattern as handlers grow.
- Line endings: add `.gitattributes` to normalize to LF (Linux containers/CI safety).

---

## Stage 10 — First Frontend<->Backend Interaction (the skeleton walks)

**Built:** React+Vite+TS frontend (`frontend/`) scaffolded with Vite. Replaced the demo
`App.tsx` with a health-check UI that fetches `GET /healthz` on load and renders three
states: loading / ok / error. Added a least-privilege CORS middleware to the Go API that
allows only `http://localhost:5173`.

**The CORS lesson (learned by hitting the wall first):**
- Browsers enforce the **Same-Origin Policy**: JS on origin A cannot READ responses from
  origin B unless B opts in. Origin = scheme + host + **port**, so `:5173` vs `:8080` differ.
- The browser blocked the call with "No 'Access-Control-Allow-Origin' header". Fix belongs on
  the **server**: it declares `Access-Control-Allow-Origin`. We named the specific frontend
  origin (least privilege), not `*`.
- CORS is **browser-enforced and protects users** (stops evil.com from reading an API you're
  logged into with your session). `curl` ignores CORS entirely — it only guards browsers.
- **Deferred:** preflight (`OPTIONS`) handling — not needed until we send custom headers like
  `Authorization`; will add alongside auth.

**React concepts learned:**
- Component = a function returning JSX; boot flow `index.html -> main.tsx -> <App/>` into `#root`.
- `useState` = component memory; `useEffect(fn, [])` runs once after mount — the right place
  for a fetch. State change -> automatic re-render.
- A **discriminated union** (`loading | ok | error`, tagged by `kind`) makes illegal states
  unrepresentable; TypeScript narrows the type per branch.
- `fetch` resolves even on 4xx/5xx — must check `res.ok`; `.catch` handles network/CORS
  failures. Always render an explicit error state.
- React **StrictMode** double-invokes effects in dev (why we saw two requests) — dev-only.

**Middleware concept:** a function that wraps a handler to run shared logic (here, CORS
headers) around every request — the standard Go shape `func(next http.Handler) http.Handler`.

---

## Version Control — Published to GitHub

**Published** to a **private** repository: https://github.com/rehrabbi/SentinelOps
(remote `origin`, branch `main`, pushed via the `gh` CLI using existing auth — no tokens
handled manually). Two commits pushed. Private = only invited collaborators can view; can be
flipped to public later. Chose to keep the real commit email (acceptable on a private repo).

**What I learned:** Local commits live only on my machine until `git push` sends them to a
remote. `gh repo create --source . --remote origin --push` creates the repo, wires the
remote, and pushes in one step. Repo visibility and commit-email privacy are deliberate
choices to make *before* the first push.

*(This log entry is uncommitted — it will be included in the next commit.)*

---

## Stage 6/12 — Database Rib: Postgres in Docker + Go connection

**Built:**
- `compose.yaml` runs **Postgres 17-alpine** locally: **localhost-only** port bind
  (`127.0.0.1:5432`), a named volume `pgdata` for persistence, and a `pg_isready`
  healthcheck. Credentials come from a **git-ignored `.env`**; `.env.example` is the
  committed template.
- `backend/db.go`: `openDB()` opens a `database/sql` connection **pool** using the **pgx**
  driver (blank-imported to register it). Pool tuned (max open/idle conns, conn lifetime).
- `backend/main.go`: reads `DATABASE_URL` from the environment (12-factor, fail-fast if
  missing), opens the pool, and adds `GET /readyz` (readiness) that `PingContext`s the DB
  with a 3s timeout — `200 ready` / `503 unavailable`. `/healthz` stays liveness-only.
- Dependency added: `github.com/jackc/pgx/v5`.

**Verified (the payoff):** with DB up, `/readyz` = ready. Stopped the DB container ->
`/readyz` = 503 while `/healthz` stayed 200 (process alive, just not ready). Restarted ->
`/readyz` = ready. Proves the liveness/readiness split.

**Concepts learned:**
- Docker: image vs container vs volume; Compose as declarative, version-controlled infra;
  binding a DB port to localhost only (don't expose to the LAN); container healthchecks.
- Secrets: git-ignored `.env` + committed `.env.example` template; never commit credentials,
  never hard-code them; read config from the environment (12-factor).
- Go + DB: a blank import registers a `database/sql` driver; `sql.Open` is lazy (prepares a
  pool, connects on first use); connection pools reuse connections; `PingContext` bounded by
  a `context` timeout; passing `db` into a handler via a closure (no globals).
- Liveness (is the process up?) vs readiness (can it serve traffic / are deps reachable?) —
  separate endpoints so a DB blip pauses traffic instead of forcing restarts.
- Supply chain: `go.sum` + the checksum database verify dependency integrity on every fetch.

*(This log entry is uncommitted — it and the previous entry go in the next commit.)*

---

## Stage 6 (cont.) — First Migration: golang-migrate + users table

**Built:**
- Migration tooling: **golang-migrate** used as a library. SQL migrations are embedded in
  the binary via `go:embed`; a `migrate` **subcommand** on the api binary applies them
  (`api.exe migrate`), kept separate from server startup so schema changes are deliberate.
  A `schema_migrations` table tracks the current `version` and a `dirty` flag.
- First migration `000001_create_users` (`.up.sql` / `.down.sql`): the `users` table with a
  **UUID** primary key (`gen_random_uuid()`), `email` / `password_hash` / `full_name` as
  `NOT NULL text`, `created_at` / `updated_at` as `timestamptz DEFAULT now()`, and a UNIQUE
  index on `lower(email)` for case-insensitive email uniqueness.
- Dependency added: `github.com/golang-migrate/migrate/v4` (installed with a targeted
  `go get`, NOT `go mod tidy`, to avoid pulling the driver's heavy test-only deps).

**Verified:** migration applied (`version 1, dirty = f`). Live constraint tests: an insert
auto-generated the UUID + timestamps; a case-variant duplicate email was rejected by the
unique index; a NULL email was rejected by NOT NULL. Test row deleted (table left empty).

**Concepts learned:**
- Migrations = versioned, ordered, reversible schema changes; `schema_migrations` bookkeeping;
  `dirty = t` means a migration failed midway and must be resolved before continuing.
- Constraints (`NOT NULL`, `UNIQUE`) are enforced by the **database** regardless of app bugs —
  the last line of defense for data integrity.
- Case-insensitive uniqueness via a unique index on `lower(email)`.
- DB-generated UUID primary keys; `timestamptz` defaults.
- `go:embed` ships migrations inside the binary; keep `migrate` a separate step from serving.
- Transient Go checksum-DB (`sum.golang.org`) failures are retryable; targeted `go get`
  avoids pulling a dependency's test-only deps that `go mod tidy` would.

**Security note (observed):** a Postgres error `DETAIL` echoed the failing row (incl. the fake
hash). The API must NEVER return raw DB errors to clients (sensitive-data exposure) — map DB
errors to safe, generic messages in handlers.

*(Log entry uncommitted — goes in the next commit.)*

---

## Stage 8 — Users API: read path (GET /api/users)

**Built (by-feature layering in `internal/user`):**
- `user.go`: the `User` model; `PasswordHash` tagged `json:"-"` so it can never serialize to
  a client.
- `repository.go`: `Repository` (owns the `*sql.DB`); `List(ctx)` runs the SELECT (omitting
  `password_hash`), scans rows into `[]User`, checks `rows.Err()`, returns a non-nil empty
  slice so "no users" encodes as `[]` not `null`.
- `handler.go`: `Handler.List` calls the repo, logs the real error server-side but returns a
  generic 500 to the client (no sensitive-data exposure).
- `main.go`: wired `userRepo -> userHandler` by hand (manual dependency injection) and
  registered `GET /api/users`.

**Verified:** seeded 2 users; `GET /api/users` returned them as JSON (id, email, fullName,
timestamps) with NO `password_hash` (confirmed by a leak check). CORS header present, so the
frontend can consume it.

**Concepts learned:**
- Layered request flow: router -> handler (HTTP concerns) -> repository (SQL concerns) -> DB
  and back. Each layer has one job.
- Go packages + the special `internal/` dir (only importable within this module); exported
  (Capitalized) vs unexported identifiers; constructor funcs (`NewRepository`/`NewHandler`).
- `database/sql` read path: `QueryContext`, `rows.Next()`/`Scan` (scan order must match the
  SELECT), `defer rows.Close()`, and checking `rows.Err()` after the loop.
- Don't fetch secrets you don't need (omitted `password_hash`) + `json:"-"` as a second layer.
- Error handling: log detail server-side, return a generic message to the client.
- Manual dependency injection: `main()` constructs and connects the pieces explicitly.

---

## Stage: Users write API — POST /api/users (user creation / registration)

**Decisions made (via decision prompts):**
- Password hashing: **bcrypt** (`golang.org/x/crypto/bcrypt`, Go-team maintained) over argon2id —
  simplest to get right; strong enough. Cost = `bcrypt.DefaultCost` (10).
- Input validation: **hand-written** (no validator library) — see the mechanics explicitly.
- Password policy: **min 12 characters, no composition rules** (NIST 800-63B: length > symbols),
  max 72 bytes (bcrypt's hard limit — we reject, never silently truncate).
- Duplicate email: **trust the DB constraint** — INSERT and catch Postgres `23505`
  (unique_violation), map to a sentinel `ErrEmailTaken` -> `409`. Atomic; avoids the
  TOCTOU race a "SELECT-then-INSERT" pre-check would have.

**Built (user typed all code in VSCode; I reviewed + gofmt'd each file):**
- `internal/user/validate.go` (new): `CreateInput` struct, `Normalize()` (trim + lowercase email;
  deliberately does NOT trim password), `Validate()` with `ErrValidation` sentinel wrapped via `%w`.
  Uses `net/mail.ParseAddress` + bare-address check; rune count for min, byte count for max.
- `internal/user/repository.go`: added `ErrEmailTaken` + `Create(ctx, email, fullName, passwordHash)`
  using `INSERT ... RETURNING`, `$1/$2/$3` params, and `errors.As` on `*pgconn.PgError` to detect 23505.
- `internal/user/handler.go`: added `Create` handler — `MaxBytesReader` (1 MiB cap),
  strict JSON (`DisallowUnknownFields` + `dec.More()`), `Normalize`+`Validate`,
  `bcrypt.GenerateFromPassword`, error mapping (`ErrEmailTaken`->409, else 500), `201` + `Location`.
  Repo never sees plaintext — hashing happens in the handler.
- `main.go`: registered `POST /api/users -> userHandler.Create` (method-based mux route).
- Added dependency: `golang.org/x/crypto` (bcrypt), now direct. `go mod tidy` / `vet` / `build` all green.

**Verified (live, via curl + psql):**
- Valid create -> `201`, `Location` header, user JSON with NO `passwordHash`.
- Duplicate (`CAROL@` vs `carol@`) -> `409` — proves case-insensitive `lower(email)` index.
- Password < 12 -> `400`; bad email -> `400`; unknown field `isAdmin` -> `400` (mass-assignment blocked).
- DB inspection: stored hash = `$2a$10$…`, 60 chars — a real bcrypt hash (salt embedded).

**Concepts learned:**
- Never trust the client: the server is the only enforcement point. Six-step defensive handler
  (size cap -> strict parse -> validate -> hash -> error-map -> 201).
- bcrypt anatomy: `$2a$` alg, `10` cost (2^10 rounds), embedded salt, fixed 60-char output —
  so no separate salt column; identical passwords -> different hashes.
- `errors.As` (extract a typed error like `*pgconn.PgError`) vs `errors.Is` (identity match);
  `%w` wrapping + sentinel errors as the clean cross-layer error-signaling pattern.
- REST semantics: `POST` = create, `201 Created` + `Location`, distinct method routes on one path.
- Mass-assignment defense via `DisallowUnknownFields`.

**Security notes:**
- Account enumeration: returning `409` reveals an email is registered. Accepted for UX in this
  portfolio app; revisit for registration/login hardening (generic responses / email-verification flow).
- Fake seed users (alice/bob) have invalid hashes and cannot authenticate; clean up when building login.

*(Committed in b353b02.)*

---

## Stage: Authentication — decisions + sessions table (migration 000002)

**Decisions made (via decision prompts):**
- Auth strategy: **server-side sessions** (opaque token in an HttpOnly cookie, session row in
  Postgres) over JWT or a managed provider — most secure + instructive for a browser app;
  instant revocation; teaches secure cookies + CSRF. Revisit JWT later for service/mobile APIs.
- Token at rest: store only the **SHA-256 hash** of the session token, never the raw token —
  a DB leak yields useless hashes. Fast SHA-256 is fine here (token is 128+ bits of randomness,
  nothing to brute-force) — contrast bcrypt for guessable human passwords.
- Session lifetime: **7-day absolute expiry**.

**Built (user typed the SQL; I reviewed):**
- `migrations/000002_create_sessions.up.sql`: `sessions` table — `token_hash text PRIMARY KEY`,
  `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `created_at` (default now()),
  `expires_at`; plus `sessions_user_id_idx` and `sessions_expires_at_idx`.
- `migrations/000002_create_sessions.down.sql`: `DROP TABLE IF EXISTS sessions;`.

**Verified:** `go run . migrate` applied cleanly; `\d sessions` shows the 4 columns, PK on
token_hash, both indexes, and the FK with ON DELETE CASCADE; `schema_migrations` = 2, dirty = f.

**Concepts learned:**
- Session token is a *bearer credential* — hashing it at rest is defense-in-depth against DB leaks.
- Foreign keys + `ON DELETE CASCADE`: the DB enforces the session→user relationship and auto-cleans.
- Why hash choice differs by input entropy (bcrypt for passwords vs SHA-256 for random tokens).

*(Log entry uncommitted — goes in the next commit.)*

---

## Stage: Authentication — login endpoint (POST /api/sessions)

**Built (user typed; I reviewed):**
- `internal/auth/handler.go` (new package): `Handler` holding both repositories +
  `secureCookies`, `NewHandler`, `loginInput`, and `Login` — strict JSON decode (1 MiB cap,
  `DisallowUnknownFields`), `GetByEmail`, bcrypt compare, `GenerateToken`, session insert,
  hardened `Set-Cookie`, 200 + user JSON.
- `main.go`: `sessionRepo` + `authHandler` wired by hand, `POST /api/sessions` registered,
  `envOr`/`envBool` config helpers, `withCORS(next, allowedOrigin)` with credentials +
  OPTIONS preflight.

**Why `auth` is its own package:** login needs *both* `user` (verify password) and `session`
(record the login). Putting it in either domain would force that domain to import the other
— coupling two independent domains, and risking an **import cycle** (a compile error in Go,
not a warning). `auth` sits above both and depends on each; neither knows the other exists.

**Decisions made:**
- `SECURE_COOKIES` as a dedicated boolean env var (default false) rather than deriving it
  from an `APP_ENV`: the link from variable to behavior stays direct and hard to misread.
- `FRONTEND_ORIGIN` env var replacing the hardcoded `allowedOrigin` const.
- Handle OPTIONS preflight now rather than deferring it to frontend work.

**Bug found and fixed before it bit:** `withCORS` set only `Allow-Origin`, and the router
registers method-specific patterns (`"POST /api/users"`). An `OPTIONS` request matched no
pattern → **405** → preflight failure. That meant *no browser JSON POST could ever succeed*,
including the registration endpoint already marked "tested and working". It passed testing
because **curl does not send preflight requests — only browsers do.** Lesson: curl proves
the handler works; it does not prove the *browser* can reach it.

**Verified (8/8):** 200 + `Set-Cookie`; wrong password → 401; unknown email → 401
byte-identical; unknown JSON field → 400; OPTIONS → 204 with full CORS headers; session row
with 64-char hash and 7-day expiry. Cookie: `Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
no `Secure` (correct on local http — a `Secure` cookie there is silently dropped by the
browser, so login would "work" while never persisting).

**Security properties proven, not assumed:**
- **No hash in the response.** `GetByEmail` deliberately loads `password_hash`, so the
  struct encoded at the end genuinely holds it — `json:"-"` is the only thing preventing the
  leak. Grepped the body for `password` and `$2a$`: clean.
- **Timing defense measurable.** Unknown email 51.0ms vs wrong password 52.0ms over 5 runs
  each. The ~50ms *is* bcrypt cost 10; without the dummy-hash compare the unknown-email path
  would return in ~1ms and stand out by ~50x. Confirmed registration also uses
  `bcrypt.DefaultCost`, so the two paths do equal work.
- **DB stores the hash, not the token.** Hashed the returned cookie locally and compared
  against `sessions.token_hash`: match, and the stored value ≠ the raw token. Worth noting
  both are 64 hex chars (32 random bytes vs SHA-256 output), so **length proves nothing** —
  only the comparison does.

**Known tradeoff to fix as a pair (not yet done):** login now resists user enumeration by
timing, but registration still returns `409 email already registered`, which leaks the same
fact far more directly and deliberately (`internal/user/handler.go`, documented in-code).
The subtle channel is closed while the obvious one stays open by choice. Either accept both
or fix both — fixing only one is theatre.

**Concepts learned:**
- Import cycles and why a composition package resolves them.
- CORS preflight: which requests trigger it, and why `Allow-Credentials: true` may never be
  paired with `Allow-Origin: *` (any site could then call the API with the victim's cookie).
- `init()` for one-time package setup; package-level state.
- Config precedence: env var → safe default, with a logged warning on unparseable input so a
  security flag never silently falls back.

*(Log entry uncommitted — goes in the next commit.)*

---

## Stage: Second development environment (macOS, Apple Silicon)

Set up the project from a bare Mac to prove the repo is genuinely portable. Full setup
details live in `PROJECT-STATE.md` §9; the *lessons* are here.

- **Docs are the only thing that travels.** Claude's memory doesn't, and neither does the
  database: `pgdata` is a local Docker volume, so every seeded user from the Windows box was
  absent. A fresh test user had to be registered. Worth remembering before assuming "the
  data is just there" on any new machine.
- **Git identity doesn't survive a clone.** `user.name`/`user.email` were unset, and a
  commit fails outright until they're configured.
- **Stale PATH is not a broken install.** `command not found: docker` in a terminal opened
  *before* the tool was installed — shells read PATH once at startup. A new tab fixes it.
  Diagnose by checking whether the binary exists on disk before reinstalling anything.
- **Unbundling Docker Desktop has a cost.** Colima (VM), `docker` (CLI), and compose
  (plugin) are three packages that must be told about each other — hence the
  `cliPluginsExtraDirs` entry in `~/.docker/config.json`.
- **Secrets can be generated without ever being seen.** The new Postgres password came from
  `/dev/urandom` straight into a `chmod 600` `.env` — never printed, never in shell history.
  Kept alphanumeric on purpose: `@`, `/`, `:`, `#` would break the `postgres://` URL parse
  unless percent-encoded.

*(Log entry uncommitted — goes in the next commit.)*

---

## Stage: Authentication — auth middleware + GET /api/me

**Built (user typed; I reviewed + gofmt'd each file):**
- `internal/session/repository.go`: `GetByTokenHash` — fetch a session by token hash **only
  if `expires_at > now()`** (expiry enforced in SQL); `ErrSessionNotFound` sentinel, so a
  missing and an expired session are indistinguishable by design.
- `internal/user/repository.go`: `GetByID` — load a user by primary key **without**
  `password_hash` (identity lookup, not authentication).
- `internal/auth/middleware.go` (new): `RequireAuth(next)` — read cookie → `HashToken` →
  `GetByTokenHash` → `GetByID` → attach the `user.User` to the request context → call next;
  every failure short-circuits with a generic `401`. `UserFromContext(ctx)` reads it back.
- `internal/auth/handler.go`: `Me` — returns the context user as JSON, carrying no auth logic
  of its own. `main.go`: `GET /api/me` registered behind `RequireAuth`.

**Decisions made (decision prompts):**
- Enforce session expiry **in SQL** (`WHERE token_hash = $1 AND expires_at > now()`) — one
  round-trip, the DB clock is the single source of truth, and expired == missing.
- Attach the **full `user.User`** to the request context (vs just the ID) — protected handlers
  get the user for free; slim it later only if it ever costs too much.
- First protected route = **`GET /api/me`** (the frontend needs it anyway, so not throwaway).
- Context key = an **unexported named type** (`type contextKey int`), never a bare string.

**Verified (live, 7/7):** no cookie → 401; garbage cookie → 401; register → 201; login →
200 + `Set-Cookie`; `/api/me` with the cookie → 200 returning the **exact** registered user;
body contains no `password_hash`; and after `UPDATE sessions SET expires_at = past`, the same
cookie → 401 — proving the SQL expiry filter, not just the happy path.

**Concepts learned:**
- The Go middleware pattern as a **method** (it needs the handler's repositories) vs a plain
  `func(next) http.Handler`.
- **Fail-closed / default-deny**: every error path returns and rejects; `next` runs only on the
  success path at the bottom — a missing `return` would be a security hole.
- **Request context** for request-scoped values, keyed by an unexported named type so keys
  cannot collide across packages (`go vet` flags bare-string context keys).
- We compare the **hash** of the presented token against the stored hash — the raw token
  never needs to exist in the database.
- Least-privilege data loading: three user reads now differ by need — `List` and `GetByID`
  omit `password_hash`; only `GetByEmail` (login) loads it.

**Workflow / repo change:** adopted **GitHub Flow**. `main` is now protected (PR required,
0 approvals so I can self-merge, `enforce_admins: true`, force-push + deletion blocked,
conversation-resolution required). Work happens on short-lived `feat/*` branches merged into
`main` via PR. This feature was built on `feat/auth-middleware` and merged via its PR.

*(Committed with the middleware docs on `feat/auth-middleware`.)*

---

## Stage: Authentication — logout (DELETE /api/sessions/current)

**Decisions made (decision prompts):** logout is **public & idempotent** (NOT behind
`RequireAuth`) and returns **`204 No Content`**. Rationale: refusing to log out an
already-expired session would leave a dangling cookie in the browser; deleting a non-existent
row is a harmless no-op, so "always clear the cookie, always succeed" is both simpler and safer.

**Built (user typed; I reviewed + gofmt'd):**
- `internal/session/repository.go`: `DeleteByTokenHash` — `DELETE FROM sessions WHERE
  token_hash = $1` via `ExecContext`; idempotent (0 rows affected is still success), so it
  never inspects `RowsAffected`.
- `internal/auth/handler.go`: `Logout` — if a cookie is present, hash it and delete the row
  (true server-side revocation); **always** overwrite the cookie with an expired one
  (`MaxAge: -1`, empty value) so the browser drops it; respond `204`. A real DB error → 500.
- `main.go`: `DELETE /api/sessions/current -> authHandler.Logout` — a public route (no
  middleware wrap), method-matched.

**Verified (live, 6/6):** logged in → `/api/me` 200; `DELETE` → 204 with
`Set-Cookie: sentinelops_session=; Max-Age=0; HttpOnly; SameSite=Lax`; `/api/me` with the
**same token** afterwards → 401; DB session count for the user = 0; a repeat `DELETE` with the
dead token → 204; `DELETE` with no cookie → 204. The 401-with-the-original-token is the key
result: revocation is **server-side**, not merely a forgotten cookie.

**Concepts learned:**
- A SQL `DELETE` of a non-existent row is not an error — it affects 0 rows and succeeds. That
  property *is* the idempotency; no need to check `RowsAffected`.
- `ExecContext` (no result rows) vs `QueryRow` (one) vs `QueryContext` (many).
- Deleting a cookie = re-`Set-Cookie` with the **same Name + Path** and `MaxAge < 0` (renders
  as `Max-Age=0`); the browser only replaces a cookie when name and path match the original.
- Server-side sessions give **instant revocation** — the reason we chose them over JWTs — and
  logout is exactly where that advantage is realized.

*(Committed on `feat/logout`.)*

---

## Stage: Frontend — auth UI (login / session / logout) wired to the API

**Decisions made (decision prompts):** auth state in **local `App` state** (not Context yet —
one screen); API base URL as an **env-overridable constant** (`import.meta.env.VITE_API_URL ??
'http://localhost:8080'`); all fetch logic in a **dedicated `src/api.ts`** helper.

**Built (user typed; I type-checked with tsc + oxlint):**
- `src/api.ts`: `API_BASE`, `User` type, `ApiError` (carries the HTTP status), a `request`
  wrapper that ALWAYS sets `credentials: "include"`, and `getMe()` (→ `User | null`, 401 =
  null), `login()`, `logout()`.
- `src/App.tsx`: `getMe()` on mount to detect a session; discriminated-union `AuthState`
  (loading | anonymous | authenticated); `LoginForm` (controlled inputs, `preventDefault`,
  submitting/error states, `instanceof ApiError`); `LoggedIn` (welcome + logout button).
- `src/App.css`: token-based, theme-aware styling; accessible `:focus-visible` rings; a
  monochrome primary button that flips per theme for guaranteed contrast.

**Verified in a real browser:** load → login form; valid creds → "Welcome, <name>"; logout →
back to the form; log in again + **reload → still logged in** (cookie persisted). The two
`401` console lines are the expected anonymous `GET /api/me` checks (React StrictMode
double-fires the effect once in dev).

**Concepts learned:**
- The client CANNOT read the HttpOnly session cookie — auth state comes from asking
  `GET /api/me`, never from `document.cookie`. That is the point of HttpOnly (XSS can't steal it).
- `credentials: "include"` is mandatory on every cross-origin API call, or the browser neither
  stores nor sends the session cookie (:5173 ↔ :8080).
- Controlled inputs (value + onChange), `e.preventDefault()` on submit, lifting state up via
  callbacks (`onLoggedIn` / `onLogout`), and typed error handling with `instanceof ApiError`.
- Vite exposes `VITE_`-prefixed env vars on `import.meta.env`; a fallback avoids requiring a
  frontend `.env`. `verbatimModuleSyntax` forces `import type` for type-only imports.
- React auto-escapes rendered values → XSS-safe rendering of server data.

*(Committed on `feat/frontend-auth`.)*

---

## Stage: Frontend — registration UI (signup + auto-login)

**Decisions made (decision prompts):** after a successful signup, **auto-login** (call
`login()` with the same credentials, since `POST /api/users` does not start a session);
**minimal client-side validation** (HTML `required` / `type="email"` / `minLength={12}` hints;
the Go server stays authoritative and its messages are shown).

**Built (user typed; tsc + oxlint clean):**
- `src/api.ts`: added `register(email, password, fullName)` — POSTs `/api/users`, and on
  failure reads the server's plain-text message (`.trim()`) into `ApiError`, so the form shows
  the real reason (validation detail, or "email already registered").
- `src/App.tsx`: a `mode` state (`login | register`) toggled by a link (`<button
  type="button" className="link">`); a `RegisterForm` (full name + email + password) that
  registers then **auto-logs-in**; logout now also resets `mode` to `login`.
- `src/App.css`: `.auth-switch` + `.auth-card .link` (a button styled as a link, scoped with
  higher specificity to override the primary `.auth-card button`).

**Verified in a real browser:** switch to Register → new signup → `POST /api/users` 201 →
`POST /api/sessions` 200 → auto-logged-in ("Welcome, New User"); duplicate email → "email
already registered" shown, stays on the form; logout → returns to the **login** view.

**Concepts learned:**
- Registration and login are separate concerns — creating an account does NOT authenticate;
  the client sequences register → login to auto-login.
- Reading a non-OK response's text body to surface server-authored error messages (keeps the
  server the single source of validation truth — the "minimal client validation" decision).
- CSS specificity: `.auth-card .link` (two classes) beats `.auth-card button` (class +
  element), so the link styling wins — a concrete specificity lesson.
- A `<button type="button">` styled as a link is the accessible way to trigger an in-page
  action (vs an `<a>` with no real href); `type="button"` stops it submitting the form.

**Security note (unchanged, revisit later):** the signup form surfaces the `409` "email already
registered" — the same account-enumeration leak flagged earlier. Accepted for this portfolio
app; the login path stays timing-safe.

*(Committed on `feat/registration-ui`.)*

---

## Stage: Incident domain — RBAC + incident CRUD (backend)

**Decisions made (decision prompts):**
- **Authorization model: RBAC** (chosen over owner-based-first). A single **`role` column** on
  users (not a many-to-many roles table); values **reporter / analyst / admin**, default
  **reporter** (least privilege). reporter = own incidents; analyst = view all; admin = all +
  user-mgmt later.
- **Incidents schema:** include **severity** (`low/medium/high/critical`, default medium) and a
  **4-state status** lifecycle (`open/investigating/resolved/closed`, default open), both
  CHECK-constrained. Owner FK **`ON DELETE RESTRICT`** to protect the audit trail (unlike
  sessions' CASCADE).

**Built (user typed; gofmt/build/vet clean; verified live):**
- Migration `000003_add_user_role`: `ALTER TABLE users ADD COLUMN role ... NOT NULL DEFAULT
  'reporter' CHECK (role IN (...))`. Backfilled existing users; CHECK rejects invalid roles.
- `User.Role` added; `List`/`Create`/`GetByEmail`/`GetByID` all select `role`, so the
  middleware-loaded user (from `GetByID`) carries the role — authorization reads it from the DB,
  never from the client.
- Migration `000004_create_incidents`: incidents table (uuid PK, `user_id` FK RESTRICT, title,
  `description NOT NULL DEFAULT ''`, status + severity CHECK enums, timestamps) + indexes on
  `user_id` and `status`.
- `internal/incident`: `Incident` model; repo `Create` (owner is a param, never from the body;
  status omitted so it defaults `open`) + `ListAll` + `ListByUser` (owner-scoped) sharing a
  private variadic `query` helper; handler `Create` (strict JSON, NO `userId`/`status` fields,
  severity validated to a clean 400 and defaulted to medium) + `List` (RBAC: switch on
  `user.Role`; analyst/admin → `ListAll`, else → `ListByUser`; `default` = least privilege).
- `main.go`: `POST`/`GET /api/incidents` behind `RequireAuth`.

**Verified live (RBAC / IDOR / validation):** reporter1 lists → only their own incident;
reporter2 → only theirs; analyst → both (role promoted via SQL, took effect on the next request
with no re-login — proving the role is loaded fresh each request). Unauthenticated GET/POST →
401. Forged `userId` → 400; `status` on create → 400 (both rejected by `DisallowUnknownFields`);
invalid `severity` → 400; empty `title` → 400.

**Concepts learned:**
- **Authentication vs authorization**: authn proves identity; authz decides what you may do.
  Broken access control is OWASP #1; **IDOR** is the classic form.
- The IDOR defense is **scoping every query by the authenticated user** (`WHERE user_id = $1`);
  the authz *policy* lives in the handler while the repo stays neutral (data operations).
- RBAC via a role column + CHECK constraint — defense in depth (the DB itself refuses invalid roles).
- **Never trust client-supplied identity/authority**: the owner and status come from the server,
  the role from the DB via the session; a client-sent `userId`/`status` field is rejected outright
  (the mass-assignment defense).
- `ON DELETE RESTRICT` vs `CASCADE`: incidents are audit records (block user deletion) while
  sessions are disposable (cascade).

**Environment notes (not code):** Windows Defender false-positived `go run`'s temp binary
("contains a virus"); worked around by building to a fixed path (`backend/bin/api.exe`, which is
git-ignored). Docker Desktop stopped mid-session and needed a manual restart (Postgres did a
clean crash-recovery). Consider a Defender exclusion for the Go build cache / project directory.

*(Committed on `feat/incidents`.)*

---

## Questions to revisit later
- Revisit if the Go learning curve slows the security/cloud learning too much (fallback:
  a TypeScript/Node backend). Decided against for now in favor of cloud-native depth.
- Account enumeration: decide whether to close BOTH channels (login timing + registration's
  409) or accept both. Currently inconsistent — the subtle one is defended, the obvious one
  is not.
- Expired `sessions` rows are never cleaned up. Decide on a strategy (periodic delete job vs
  cleanup on write) before this reaches production.
