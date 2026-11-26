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

## Stage: Frontend — incident dashboard (list + create, RBAC-agnostic UI)

**Decisions made (decision prompts):** the dashboard lives in a **new `src/incidents.tsx`**
component (keeps `App.tsx` focused on auth); incidents are presented as **styled rows with
colored status/severity badges**. (Also: after create, **prepend** the returned row — no refetch.)

**Built (user typed; tsc clean; verified in-browser):**
- `src/api.ts`: `Incident` + `IncidentStatus`/`IncidentSeverity` union types,
  `CreateIncidentInput`, and `getIncidents()` / `createIncident()` (through the shared `request`
  wrapper, so `credentials: "include"` is automatic; `createIncident` surfaces the server's text
  error).
- `src/incidents.tsx`: `IncidentDashboard` (fetches on mount into a `loading|error|ready`
  discriminated union; **RBAC-agnostic** — renders whatever the server returns) + a local
  `CreateIncidentForm` (controlled title/description/severity-`select`; clears on success; lifts
  the new incident up via `onCreated`; the dashboard prepends it).
- `src/App.tsx`: the `LoggedIn` view now renders `<IncidentDashboard/>` (with the welcome card,
  wrapped in a fragment).
- `src/App.css`: dashboard styles — form card, incident rows, and **badges whose color is driven
  by the className** (`badge severity-high`, `badge status-open`, …), all theme-aware via tokens.

**Verified in-browser:** login → dashboard shows your incidents; create → the new incident
appears at the top with `status=open`; **RBAC demo** — as a reporter, uitest saw 1 (own)
incident; after `UPDATE users SET role='analyst'` + reload, the *same account* saw all 3 (no
re-login, because the role is read fresh from the DB each request).

**Concepts learned:**
- The UI can be **role-agnostic**: it calls one endpoint and renders the result; the server
  decides what to return. Authorization stays on the server — the client is untrusted.
- **Data-driven styling**: the component builds a className from the data (`severity-${…}`) and
  CSS maps each value to a color — no per-value JS branching.
- `<select>` / `<textarea>` as controlled inputs; lifting state up (`onCreated`); an
  optimistic-ish prepend using the real returned row (no refetch).
- String-literal union types mirroring the DB enums give autocomplete and drive the badge classes.

**Env note (Windows):** the project folder was renamed to include a space + `&`
(`Cloud-Native Incident & Ticket Management`), which breaks `npx` / `npm run` (cmd treats `&` as
a command separator). Run tools via node directly — e.g.
`node node_modules/typescript/bin/tsc -p tsconfig.app.json` and `node node_modules/vite/bin/vite.js`.

*(Committed on `feat/incident-ui`.)*

---

## Stage: Incident detail + update — per-object authorization (IDOR at the object level)

**Decisions made (decision prompts):** `PATCH /api/incidents/{id}` may update **status +
severity + title + description** (full partial edit); **owner OR analyst/admin** may update
(a reporter edits their own; analysts/admins any). Frontend: an **inline status dropdown** per
row (rather than a full detail page for now).

**Built (user typed, across two devices; gofmt/build/vet + tsc clean; verified live):**
- `GET /api/incidents/{id}` was built on the **other device** (commit `b92779e`):
  `GetByID` (any owner) and **`GetByIDForUser`** (`WHERE id=$1 AND user_id=$2`) sharing a `get`
  helper, `ErrIncidentNotFound`, and a handler that first checks the id against a
  **UUID-shape regex** — a malformed id becomes a clean 404 instead of reaching Postgres (which
  would reject it as invalid uuid syntax and surface as a 500).
- `PATCH /api/incidents/{id}` was layered on top: repository `Update` (writes fields by id,
  `updated_at=now()`, RETURNING, via the shared `get`); handler `getScoped` (analyst/admin →
  `GetByID`; else `GetByIDForUser`) and **`Update`** (same UUID check, then authorize by a scoped
  read FIRST, then apply the provided fields — a pointer-based `updateInput` so nil = "not
  sent"; validates status/severity; all-nil body → 400).
- `main.go`: `GET`/`PATCH /api/incidents/{id}` behind `RequireAuth`; added **`PATCH` to the CORS
  `Access-Control-Allow-Methods`** (PATCH is non-simple → browser preflights it).
- `src/api.ts`: `updateIncident(id, changes)` — PATCH; `changes` typed
  `Partial<Pick<Incident, …>>`.
- `src/incidents.tsx`: extracted **`IncidentRow`** (owns its own saving/error state) with a status
  `<select>` that PATCHes on change; the dashboard's `handleUpdated` replaces that row in place.

**Verified (12/12 curl + in-browser):** owner GET/PATCH → 200; **another reporter → 404** on both
(object-level IDOR defense — 404 not 403, so existence never leaks); analyst → 200 on any;
unauthenticated → 401; nonexistent id → 404; invalid status/severity, empty body, unknown field
→ 400; partial edit changes only the sent fields. In the browser, changing a row's status via the
dropdown **persisted across a reload** (fresh GET).

**Concepts learned:**
- **Per-object authorization**: list-scoping isn't enough — every by-id read/write must check
  "may THIS caller touch THIS object?". The clean pattern: **authorize with an owner/role-scoped
  read first**, then mutate; a caller who can't see it gets `ErrIncidentNotFound`.
- **404 vs 403**: return 404 for "not yours" so you don't leak that the object exists.
- **Partial updates with pointer fields** (`*string`): distinguish "field absent" (nil) from
  "field set to empty" — the core of a correct `PATCH`.
- **CORS + PATCH**: non-simple methods are preflighted; the method must be listed in
  `Access-Control-Allow-Methods` or the browser call fails (curl wouldn't reveal it).
- React: a per-row component owning its own transient (saving/error) state; lifting the updated
  entity up to replace it in the parent list.
- **Validate untrusted path params before they reach the DB**: an id from the URL is user input.
  Checking its shape turns "malformed" into the same 404 as "missing" / "not yours" instead of a
  500 that leaks an internal error class.

**Git lesson — reconciling work from two devices (rebase + conflicts):**
- The same branch got a commit pushed from the other device while this device had unpushed
  commits → `git push` was rejected as non-fast-forward. Never force-push over it: **rebase the
  local, unpushed commits onto the remote** (no force needed, since nothing pushed is rewritten).
- **During a rebase, `HEAD` (the `<<<<<<<` side) is the commit you're rebasing ONTO** — here the
  other device's work — and the `>>>>>>>` side is your commit being replayed. That's the reverse
  of a normal merge.
- **A clean auto-merge is not a correct merge.** Git merged `main.go` with no conflict, yet it
  now registered `GET /api/incidents/{id}` twice — which compiles but makes `ServeMux` panic at
  startup. Read auto-merged files too, then build *and run*.
- The duplicate-work resolution kept the better version (the one with UUID validation) and
  extended its protection to the new `PATCH` path.

*(Committed on `feat/incident-detail`.)*

---

## Stage: Repo presentation (README, licence, community health, CI)

**Decisions made (decision prompts):** licence **MIT**; README aimed at **recruiters**
first; visuals are **real screenshots plus a Mermaid diagram**; the first CI workflow does
**build and vet only** for both stacks, with security scanning deferred to its own stage;
Claude drafted the workflow YAML for review rather than the usual teach-and-type, since it
is config rather than application code. Branching **stays GitHub Flow** (WAYS-OF-WORKING
§13 unchanged), now written down in `CONTRIBUTING.md`; `dev`/`staging`/`prod` environment
branches are recorded as a future step, after there is infrastructure to deploy to.

**Built:** rewritten `README.md`; `LICENSE` (MIT); `SECURITY.md`; `CONTRIBUTING.md`;
`.github/pull_request_template.md`; `.github/ISSUE_TEMPLATE/` (bug, feature, config);
`.github/workflows/ci.yml`; three screenshots under `docs/images/`.

**Security finding (the real outcome of this pass):** `GET /api/users` is registered with a
plain `HandleFunc` and is **not** behind `RequireAuth`. An unauthenticated curl returned
every user's id, email, full name, and role with a 200. It has been open since the first
stage, before auth existed, and no later stage went back for it. Recorded in the README's
"Known gaps" and as the first item in PROJECT-STATE §6.

**Concepts learned:**
- **Documentation work finds bugs.** Writing an honest API table forced a column for "auth
  required" on every route, and the one route that could not be filled in was the hole. A
  feature-by-feature build never revisits the endpoints it already shipped.
- **Least privilege applies to CI too.** A workflow gets `permissions: contents: read` so a
  compromised action cannot write to the repository with the default token.
- **`npm ci` rather than `npm install` in CI**, because it installs exactly what the
  lockfile pins and fails when the lockfile and `package.json` disagree.
- **Reading the toolchain version from `go.mod`** with `go-version-file` keeps CI from
  drifting away from what the module declares.
- **A portfolio README is read in about a minute.** Screenshot, badges, what it does, and
  the security table go above the fold; the learning narrative moves into `docs/`.
- Publishing a **"Known gaps" section** is a stronger signal than a polished README with
  nothing admitted, as long as every gap listed is genuinely tracked.

**Divergence noticed between devices:** the August session on the Mac decided that
reporters may not change `status` and that transitions follow a state machine with `closed`
terminal. The `PATCH` that shipped from the other device allows the owner to set any valid
status with no transition rules, and the log records that as the later decision. The code
and the log agree; the two sessions did not. Later decision stands, flagged here so the
disagreement is not mistaken for a bug.

*(Committed on `docs/repo-presentation`.)*

---

## Stage: Admin-only user directory (RequireRole middleware)

**How it was found:** writing the README's API table for the repo-presentation stage forced
an "auth" column on every route. Every row could be filled in except one. `GET /api/users`
was registered with a plain `HandleFunc`, never wrapped in `RequireAuth`, and an
unauthenticated curl returned every user's id, email, full name, and role with a 200. It had
been open since the very first stage, built before authentication existed, and no later stage
went back for it.

**Decision (decision prompt):** admin-only, via a reusable middleware, over the two
alternatives of merely authenticating the route or deleting it. Nothing consumes the endpoint
today (the frontend only POSTs to `/api/users` to register), so deleting it was defensible,
but the admin role-management screen is the next stage and needs exactly this control.

**Built:** `auth.RequireRole(role string, next http.Handler) http.Handler` in
`internal/auth/middleware.go`, and the route moved in `main.go` to where `authHandler` exists,
wrapped as `RequireAuth(RequireRole("admin", ...))`.

**Verified 6/6 with curl:** anonymous 401; logged-in reporter 403; after
`UPDATE users SET role='admin'`, the **same cookie** returns 200 with no re-login; after
demoting, the very next request is 403 again; `POST /api/users` stays public; incidents
unaffected.

**Concepts learned:**
- **Authentication is not authorization.** `RequireAuth` answers "who are you". A route that
  is only authenticated is open to every registered account, which for a user directory means
  any attacker who can sign up gets a list of emails and roles.
- **Middleware order is a dependency, not a style choice.** `RequireRole` reads the user from
  the request context, and `RequireAuth` is what puts it there, so it must be chained inside.
  It also fails closed with a 401 when the context has no user, rather than trusting the wiring.
- **403 here, 404 for incidents.** The difference is whether existence is a secret. An
  incident's existence is, so "not yours" must look like "not there". A fixed route's existence
  is not, so hiding the reason would cost debuggability and protect nothing.
- **Wiring order in `main.go` is real.** The first attempt put the route in the users block and
  failed to compile, because `authHandler` is constructed further down. A compile error is the
  cheapest possible version of that lesson.
- **Documentation work is an audit.** A feature-by-feature build never revisits endpoints it
  already shipped. Writing a table with a column you must fill honestly does.

*(Committed on `feat/admin-roles`.)*

---

## Stage: Role management (admin screen, RequireRole, authctx)

**Decisions (decision prompts):** `PATCH /api/users/{id}` over `PUT /api/users/{id}/role`;
lockout guard is **refuse any self role change**; frontend gets **react-router** rather than a
conditional section; role picked with a **select plus an explicit Save** rather than saving on
change; and, when the import cycle surfaced, **extract `internal/authctx`** rather than adding
an `admin` package or bolting the handler onto `auth.Handler`.

**Built:** `user.Repository.UpdateRole`; `user.Handler.UpdateRole` with a one-field input
struct; the route behind `RequireAuth(RequireRole("admin", …))`; `internal/authctx`;
`api.ts` gained `Role`, a `role` field on `User`, `getUsers`, and `updateUserRole`;
`admin.tsx` with `AdminPage` and `UserRow`; routes in `App.tsx` and `BrowserRouter` in
`main.tsx`; admin styles plus a stacking media query.

**Concepts learned:**
- **Go's import graph is architecture.** `user` cannot import `auth` because `auth` imports
  `user`. The fix was not a trick, it was realising a request context should carry a
  **principal** (id and role) rather than a cached database row. A package that imports
  nothing can be imported by everything.
- **Authorization before validation.** The self-change refusal runs before the body is read,
  so a request we will never perform is never partly processed.
- **Refusing self-change is a race-free invariant.** An admin may demote other admins but not
  themselves, so the acting admin always survives. Counting remaining admins instead would
  need the count and the write inside one transaction, or two simultaneous demotions both pass
  the check and leave zero.
- **Draft state versus server truth.** The select holds `choice`, the row holds `user.role`,
  and `dirty` is the difference. On failure `choice` snaps back, so the screen never shows a
  role the server rejected. A UI that disagrees with the database is worse than an error.
- **A client guard is not a guard.** With the admin screen never opened, a reporter calling
  `PATCH /api/users/{id}` directly got 403 three ways, including promoting herself.
- **Roles are not hierarchical here.** `RequireRole` is an exact match, so an analyst is not
  "nearly an admin". Deliberate, since hierarchy is where authorization bugs hide.
- **Measure responsive layout, do not eyeball it.** A screenshot looked broken at phone width
  but was only cropped. Measuring showed the real bug: the name column collapsed to **32px**
  while the controls held 249px. The breakpoint (520px) was then chosen from where the layout
  actually fails rather than from a device's width.
- **A media query keys off the viewport, not the container.** The first attempt to verify the
  fix shrank the container and concluded the CSS had not applied. The CSS was fine, the probe
  was wrong.
- **The loading guard protects the route guard.** On a refresh at `/admin`, auth state starts
  as `loading`; the pre-existing early return stops `<Routes>` rendering, which is the only
  reason a hard refresh does not bounce an admin off their own page.
- **npm audit on a shallow tree.** `source-map-js` 1.2.1 to 1.2.2, a dev-only transitive
  dependency of the build toolchain, not shipped to users. `npm audit fix` moved one patch
  version and nothing else.

*(Committed on `feat/role-management`.)*

---

## Stage: Audit logging (append-only, hash-chained)

**Decisions:** asked for "tamper proof", which is not achievable in-app, so the goal was
restated as **tamper evident plus database-enforced append-only**. Postgres table over
structured stdout (queryable now, shipping off-box comes with Docker). Auth plus privileged
actions only. Entries written explicitly in handlers, because middleware sees
`PATCH /api/users/{id} 200` and not `reporter -> admin`. Role changes transactional, auth
events best effort.

**Built:** migration 000005 (`audit_log` + `audit_log_seal` + three immutability triggers);
`internal/audit` (`Entry`, `Record`, `RecordTx`, `ClientIP`, `Verify`); audit calls in
`auth.Login`/`auth.Logout`; a transactional `user.Handler.UpdateRole`; `UpdateRole` repository
method returning the previous role; `authctx.Principal.Email`; a `verify-audit` subcommand.

**Attack-tested rather than assumed:** forged `prev_hash`/`entry_hash` on insert were
overwritten by the trigger; `UPDATE`, `DELETE` and `TRUNCATE` all refused; a superuser edit to
one row was **detected**; a superuser rebuild of the entire chain was **not** detected.
Fault injection on the audit insert proved the role change rolls back.

**Concepts learned:**
- **An audit log is not application logging.** `log.Printf` is for us to debug. This is for
  accountability, read later by someone else, which drives every design choice.
- **Hash chaining gives evidence, not prevention.** Each row hashes its own content plus the
  previous hash. Editing one row breaks every link after it. Rebuilding them all is still
  possible for whoever controls the database, so the chain head must be anchored externally.
- **Compute the chain in a trigger, not the application.** A compromised app then cannot write
  a false entry. We proved it by sending `\xdeadbeef` and watching it be replaced.
- **TRUNCATE bypasses row-level triggers** and needs its own statement-level trigger. An
  append-only table without one is not append-only.
- **`ON DELETE SET NULL`, never `CASCADE`, on an audit actor.** CASCADE would mean deleting a
  user erases everything they did, which is a one-command way to destroy evidence.
- **Denormalize the actor's email on purpose.** Normalization models current state; an audit
  entry models past state, where a snapshot is correct.
- **A statement sees its own pre-statement snapshot.** The CTE reading `role` returns the OLD
  value even though the same statement overwrites it, which removes a read-then-write race.
- **`defer tx.Rollback()` right after `BeginTx`** is the standard Go transaction shape, safe
  because rollback after commit is a no-op, so every early return cleans up.
- **Accept an interface to join someone else's transaction.** `execer` and `rowQuerier` are
  three lines each and are what let a repository write inside a caller's `*sql.Tx`.
- **`IS DISTINCT FROM`, not `!=`**, when a column can be NULL. `NULL != NULL` is NULL, so a
  plain comparison would never flag the first row of the chain.
- **Keep one definition of a canonical form.** Verification recomputes hashes in SQL because a
  Go reimplementation would have to match Postgres timestamp formatting and jsonb
  normalization exactly, and any drift would report tampering that never happened.
- **A clean build does not mean wired up.** `Login` and `Logout` kept their old bodies while
  the new `record` helper sat unused, and Go compiles unused methods happily. Only reading the
  database afterwards revealed zero audit rows.
- **Edit a file bottom to top** when applying several replacements, so earlier line numbers do
  not shift under you. Several mis-selections this session came from exactly that.

*(Committed on `feat/audit-log`.)*

---

## Stage: Containerization (complete, issue #20, released as v0.2.0)

**Decisions:** two images rather than one (matches the target diagram; the rejected
single-image option would have removed CORS entirely by making everything same-origin);
`distroless/static-debian12:nonroot` for the API; `nginxinc/nginx-unprivileged:alpine` for the
frontend; app services added to `compose.yaml` so the local stack runs containerized.

**Built:** `backend/Dockerfile` and `backend/.dockerignore`; `frontend/Dockerfile`,
`frontend/.dockerignore` and `frontend/nginx.conf.template`; an `api healthcheck` subcommand,
written by the owner; and `migrate`, `api`, and `web` services in `compose.yaml` behind an `app`
profile.

**Measured, not assumed:** final image **20 MB** versus a **357 MB** builder, with the binary
layer at 10.2 MB. `docker inspect` confirms uid 65532. Attempting `--entrypoint /bin/sh`
fails with "no such file or directory", so there is genuinely no shell to pivot with. The
container exits loudly without `DATABASE_URL`, and `migrate` and `verify-audit` both run from
inside it.

Frontend: build context **130 KB** with the `.dockerignore`. The image is 91.5 MB, but 91.1 MB
of that is the nginx base; our layers are ~320 KB. Running it confirmed uid 101, a CSP carrying an
`API_ORIGIN` passed only at `docker run`, `/admin` served as `200 text/html`, a year-long immutable
cache plus gzip on `/assets/`, and a real `404` for a missing asset that still carries the headers.

**Concepts learned:**
- **Multi-stage builds exist to throw the toolchain away.** The builder needs 357 MB of Go
  compiler; the runtime needs one 10 MB binary. Measuring both makes the point concrete.
- **Copy manifests before source.** Docker caches per instruction, keyed on the files it
  touched, so `COPY go.mod go.sum` then `go mod download` means editing Go source never
  re-downloads modules. The same pattern applies to `package.json` and `npm ci`.
- **`CGO_ENABLED=0` is what unlocks distroless.** Every dependency here is pure Go, so a fully
  static binary needs no libc, which is why a base image with no libc works at all.
- **`ENTRYPOINT` over `CMD`** means `docker run image migrate` appends the argument, so the
  existing subcommands become the deployment's migration mechanism for free.
- **Distroless breaks the usual HEALTHCHECK.** There is no shell and no curl, so
  `HEALTHCHECK CMD curl -f` cannot run. The answer is a `healthcheck` subcommand on the binary
  itself, in the family of `migrate` and `verify-audit`, invoked in exec form
  (`["CMD", "/app/api", "healthcheck"]`) so Docker never looks for a shell.
- **The official nginx image runs as root.** Verified rather than assumed: `User` is empty on
  `nginx:alpine` and `101` on `nginxinc/nginx-unprivileged:alpine`, which also listens on 8080.
- **Build-time versus run-time config.** Vite inlines `VITE_API_URL` into the bundle at build
  time, so that image is environment-specific. nginx renders `/etc/nginx/templates/*` with
  envsubst at container start, so `${API_ORIGIN}` in the CSP is run-time config. Same program,
  two different kinds of configuration, and the distinction decides whether you ship one image
  or one per environment.
- **An image is not a secret store.** `DATABASE_URL` arrives at run time; anyone who can pull
  an image can read every layer of it.
- **nginx `add_header` does not merge.** A location that declares any `add_header` loses every
  one it would have inherited. Declaring one `Cache-Control` in `location /assets/` would have
  silently stripped the CSP and `nosniff` from all JavaScript. Choosing the value with a `map` and
  keeping every header at server level avoids the trap. `always` extends them to error responses.
- **envsubst only replaces variables that exist.** The nginx image limits substitution to defined
  environment variables, which is why `$uri` survives rendering. The flip side: an unset
  `API_ORIGIN` would survive too, as literal text in the CSP, so the Dockerfile sets a default.
- **`npm ci`, not `npm install`, in images.** It installs exactly what `package-lock.json` pins
  and fails if the lockfile and `package.json` disagree, so every build is reproducible.
- **A missing asset should 404.** Letting the SPA fallback answer `/assets/old.js` with
  `index.html` hands the browser HTML where it expected JavaScript and hides the real problem.
- **Measure what an image's size is made of.** 91.5 MB looked large until `docker history`
  showed 91.1 MB was the base image and our part was ~320 KB.
- **Subcommand order follows dependencies.** `healthcheck` is an HTTP client of the running
  server, so it sits before the `DATABASE_URL` check and never opens a connection pool. Tested
  with no `DATABASE_URL` at all: it reached the HTTP call and reported "connection refused".
- **An HTTP client needs a deadline.** `http.Get` has no timeout, so a hung server would hang
  the health check too and never be marked unhealthy. A 2-second `http.Client` timeout, just
  under Compose's 3-second limit, keeps the failure ours to report.
- **Liveness and readiness are different questions.** `/healthz` asks "is the process serving?"
  and `/readyz` adds "can it reach the database?". The container check uses liveness: a database
  outage should not mark the API itself broken, and readiness belongs to the load balancer.
- **Inside Compose, the host is the service name.** Containers share a private network with
  DNS, so the API reaches Postgres at `db:5432`. `127.0.0.1` inside a container means that
  container.
- **`depends_on` has conditions, and the default is the weakest.** Plain `depends_on` waits only
  for a container to start. `service_healthy` waits for its health check, and
  `service_completed_successfully` waits for a one-shot job to exit 0, which is what turns
  `migrate` into a gate the API cannot pass on a failed migration.
- **Profiles let one file serve two workflows.** Services marked `profiles: ["app"]` start only
  when asked for, so `docker compose up` kept its old meaning and nobody's native loop broke.
- **The browser enforces CORS, not the server.** The API answered a preflight from `:5173` with
  `Access-Control-Allow-Origin: http://localhost:8081`; it is the browser that compares that with
  the page's real origin and refuses the response.
- **Same-site ignores ports.** The session cookie is `SameSite=Lax`, yet a page on `:8081` calling
  the API on `:8080` still sends it, because a site is scheme plus registrable domain, and ports
  are not part of it. Two origins, one site: CORS separates them, `SameSite` does not.
- **`docker compose config` prints secrets.** It renders the file with `.env` substituted, so it
  would print the database password inside `DATABASE_URL`. `--quiet` and `--services` validate the
  file without showing values.

*(Merged into `main` by PR #21, closing #20, and released as v0.2.0 on 2026-11-21.)*

---

## Stage: CI hardening (issue #24, released as v0.3.0)

**Decisions:** scanning only, with the scheduled `verify-audit` and the chain-head anchor moved to
the AWS stage; the best free tool per job (`govulncheck`, `npm audit`, CodeQL, Trivy, gitleaks);
fail only on High or Critical findings that have a fix; results in the Security tab as SARIF;
GitHub secret scanning, push protection, and Dependabot alerts on; every action pinned to a SHA.

**What the scanners found on their first run:** 17 Go standard library vulnerabilities the code
actually calls (Go 1.26.5), one High advisory in `vite`, and 14 fixable High or Critical
vulnerabilities in the nginx base image. All three were fixed in their own PRs (#26, #27, #28)
before the workflow merged. CodeQL and gitleaks found nothing.

**Concepts learned:**
- **A scanner earns its place on its first run.** Three real problems surfaced before the workflow
  was even merged, none of them visible to the existing build, vet, lint, and test checks. A build
  being green says nothing about whether what it builds is safe.
- **Reachability beats severity for Go.** The Go vulnerability database has no CVSS scores, so
  `govulncheck` filters differently: it reports only vulnerabilities in functions the code calls.
  It found 17 that matter and set aside 9 that exist in the dependency tree but are never reached.
- **The standard library is a dependency too.** All 17 Go findings were in the toolchain itself,
  not in any module. The `go` line in `go.mod` decides which toolchain CI and every developer
  build with, so it is a security setting, not just a compatibility one.
- **"Fixable" is half of a sane fail policy.** Blocking on every High finding in a base image
  stalls every pull request on problems nobody downstream can fix. `ignore-unfixed` in Trivy and
  the `fixAvailable` filter on `npm audit` keep the gate about things we can act on.
- **Base images lag their own distribution.** Every vulnerable package in the nginx image already
  had a fixed version in Alpine's repository; the image had not been rebuilt yet. `apk upgrade` at
  build time closes the gap, at the cost of builds that drift with time, which is why the scan
  also runs weekly.
- **Remove what is not used.** `curl` was removed rather than upgraded: nginx never needed it, and
  after a break-in it is the first tool an attacker reaches for.
- **A tag is a pointer someone else controls.** `uses: actions/checkout@v4` runs whatever `v4`
  points to today. Pinning to a full commit SHA, with the version in a comment, makes the workflow
  run exactly the code that was reviewed. Downloaded binaries get the same treatment through
  checksum verification.
- **Least privilege applies to CI tokens.** The workflow defaults to `contents: read`; only the
  jobs that upload SARIF get `security-events: write`, and none can push code.
- **History is part of the attack surface.** A deleted secret is still in every clone, so gitleaks
  fetches every commit (`fetch-depth: 0`) and `--redact` keeps anything it finds out of the
  public job log.
- **Push protection acts before the leak; scanning acts after.** Secret scanning in CI can only
  report a secret that is already on GitHub. Push protection refuses the push, so it never is.
- **"Up to date before merging" in practice.** A PR that passed CI against an older `main` was held
  back after another PR merged, and had to bring `main` in and pass again. That is the gap the rule
  exists to close: two changes that each pass alone, tested together.

*(Merged into `main` by PR #25, closing #24, with all eight jobs required, and released as v0.3.0 on 2026-11-21.)*

---

## Stage: Free cloud deployment (issue #30, milestone #3, released as v0.4.0)

**Decisions:** AWS was dropped: since July 2025 its free plan is a six-month credit that may ask
for a card. The stage deploys to free platform services instead, with no card anywhere:
Cloudflare Pages for the frontend, Render's free plan for the API image from GHCR, and Neon's free
Postgres, all in Singapore and all declared in Terraform. Settled along the way:
- a same-origin Pages Function proxies `/api`, guarded by a shared secret that Terraform
  generates;
- Terraform's state lives in a separate Neon organisation;
- every provider token is scoped to this project;
- the API image is pinned by commit;
- migrations run from the owner's machine with the same image;
- frontend deploys come from a GitHub environment limited to `main`;
- the audit chain head is anchored on a protected branch every 6 hours.

**What happened:** the site went live at `https://sentinelops.pages.dev` on 2026-11-21, and the
end-to-end test passed. Registration, login, the admin screen and incidents work through the
proxy; the API refuses direct calls; audit entries carry the visitor's real address; the chain
verifies. Four surprises came from outside the code:
- Avast's HTTPS scanning broke Terraform, first natively and, after a reboot, inside Docker too.
- Render's provider cannot update free-plan services.
- Cloudflare insists on matching `fail_open` settings for production and preview.
- The Windows machine lost power during a git checkout.

**Concepts learned:**
- **"Free" is a moving target.** AWS's free tier changed shape mid-project. Free platform
  services hide networking (no VPCs, security groups or NAT) in exchange for zero cost, and the
  trade-off is worth writing down rather than discovering later.
- **Cookies care about sites, not origins.** `*.pages.dev` and `*.onrender.com` are on the
  Public Suffix List, so a frontend and an API there are different *sites*, and `SameSite=Lax`
  would drop the session cookie. Proxying `/api` through the frontend's own address keeps the
  cookie first-party without weakening CSRF protection.
- **A proxy needs a way to prove it is the proxy.** A shared secret compared in constant time
  stops anyone calling the API around it. The visitor address it forwards is trusted only on
  requests that carried the secret, and parsed before use, because a header the browser could
  set is not evidence.
- **Generate secrets where they are used.** Terraform's `random_password` goes straight to Render
  and Cloudflare, so no person ever sees or copies the proxy secret.
- **Terraform state is a secret.** Anything handed to a provider lands in state, so state lives in
  its own database, behind its own credentials. `sensitive` only stops values being printed; it
  does not keep them out of state.
- **Ephemeral values exist for a reason, and providers may not support them yet.** Neon only hands
  out its password as an ephemeral value, and Render has no write-only field to receive one. The
  database URL had to be copied once by hand. Reading the provider schemas
  (`terraform providers schema -json`) settled this before any code was written.
- **Two resources that need each other's address form a cycle.** It was broken by deriving the
  site's address from its name and checking it after creation with a postcondition.
- **Plan, read, then apply the plan you read.** Saving a plan and applying that file means nothing
  beyond what was reviewed can change; Terraform refuses a plan that has gone stale.
- **Provider bugs are real, and creation is not update.** Creating the free Render service worked;
  every later change failed because the provider always sends a setting the free plan refuses.
  The upstream issue had been open for months. A small script deploying through Render's own API
  works around it, and `terraform plan` showing "No changes" proves the two still agree.
- **Antivirus can sit in the middle of TLS.** HTTPS scanning re-signs every certificate with its
  own root. Tools that bundle their own trust store, like Terraform's providers, correctly
  refuse it. Exceptions for three API hosts fixed it without turning the protection off.
- **Least privilege, one credential at a time.** Each credential holds exactly its permission:
  - a Render key scoped to services and deploys, plus read-only log streams;
  - a Cloudflare token for Pages only, on one account, with an expiry;
  - a Neon key for the app's organisation only;
  - a separate CI token held in a GitHub environment that only `main` can use;
  - an `audit_verifier` role that can read `audit_log` and nothing else.

  Each leak would be contained.
- **Tamper evidence needs a witness outside the system.** The hash chain proves rows weren't
  edited, but whoever controls the database can rebuild the whole chain. Anchoring
  "entry N had hash H" in GitHub, a separate trust domain, and checking it on a schedule closes
  that, apart from the window since the last run.
- **Fail loudly, never silently pass.** The scheduled check refuses to run unless the anchor is
  explicitly confirmed, because an older image ignored `--anchor` and would have reported
  "intact" without checking. Its first scheduled run did fail, exactly as designed.
- **Free tiers sleep.** Render's free API stops after 15 idle minutes, and the next request gets a
  502 page while it wakes. That is availability, not security, but it surprises users.
- **A crash can corrupt what was mid-write.** Power loss during a checkout zeroed git's `HEAD`,
  index and 30 files. Because every commit had been pushed, recovery meant swapping in a fresh
  `.git` and resetting, with the damaged copy kept, not deleted. "Push early" is a backup strategy.

*(Infrastructure in #37, the end-to-end test in #38, the audit anchor in #39, the anchor-capable
image in #40, and the required Terraform check in #42; released as v0.4.0 on 2026-11-22.)*

---

## Stage: Harden the live app (issue #45, milestone #4, released as v0.5.0)

**Decisions:** hardening came before observability and environments, because v0.4.0 made the
known gaps real: anyone could now reach the login form. In order:
- an integration test suite first, so every later fix arrived with a test;
- login rate limiting in API memory, keyed on the proxy-verified visitor;
- invite-only accounts instead of open sign-up;
- pruning of expired sessions and spent invites on login.

**What happened:** each step shipped with tests that were deliberately broken to prove they could
fail. Fifteen sabotages across the stage were all caught, one only after it was redone because the
first version did not compile. Steps 1–3 went to production on 2026-11-22 with a migration (version 6,
`invites`), and step 4 followed with the release. Two production lessons came out of the deploys:
Render's free-plan provider bug (handled by `deploy-api.sh`, see v0.4.0), and the stored `api_image`
output, which needs a refresh-only apply after deploying that way.

**Concepts learned:**
- **A test that has never failed proves nothing.** The suite was written, then the code it guards
  was broken on purpose (cookie readable by JavaScript, 403 instead of 404, no rate limit, a raw token
  stored), and each test had to catch its sabotage. A sabotage that does not compile proves nothing
  either; it has to be redone so it builds.
- **Integration tests belong at the level where the bugs are.** Authorization lives in middleware and
  SQL, so the tests drive real HTTP through the real router (`newHandler`, extracted from `main()` for
  exactly this) against a real Postgres, not mocks.
- **Design tests around the system's own safeguards.** `audit_log` refuses `TRUNCATE`, so tests cannot
  reset tables; each run creates its own database instead. Tests also refuse any host but localhost,
  so a stray variable cannot point them at production.
- **A limiter is only as good as its key.** Keying on a header the visitor controls lets them claim a
  fresh identity per guess. The limiter uses the address the proxy reports behind its secret, which the
  tests already proved cannot be spoofed, and groups IPv6 by /64, since one connection owns a whole /64.
- **Check-then-act is a race.** Checking the count and recording the attempt separately let 200 of 200
  concurrent guesses through in a test. Reserving a slot under a lock first allowed exactly 10. The race
  detector, run in a container because Windows lacks a C compiler, confirms the code is clean.
- **Count the right thing.** Only failed logins count, so a correct password is never penalised; a
  success does not reset the count, or an attacker could clear it by logging into an account of their
  own between guesses. A per-account limit was rejected because it lets anyone lock a victim out.
- **Some leaks cannot be hidden, only removed.** With open sign-up and no email, enumeration survives any
  response wording: sign up, then log in with the password you chose. Uniform responses would have been
  theatre. Removing open sign-up closed it, and invites fit an internal incident tracker anyway.
- **Treat one-time tokens like passwords.** Invite tokens are 256-bit, stored as SHA-256 hashes, returned
  once with `Cache-Control: no-store`, carried after `#` so they never reach a server log or `Referer`,
  wiped from the address bar on arrival, and claimed with a single conditional `UPDATE` so two accepts
  cannot both succeed.
- **Removing a feature can remove a bootstrap.** Without sign-up there was no way to create the first
  admin; a command-line `invite`, needing database access like `migrate`, replaced "register, then
  promote in SQL".
- **Data minimisation is a control too.** Expired sessions were already refused, but they still recorded
  who logged in and when. Pruning on login, at most hourly, bounds the tables by the very activity that
  grows them, with no scheduler and no new credential.
- **Same-origin is not just a cookie rule.** Locally the frontend calls the API cross-origin, where
  browsers hide `Retry-After`, so the 429 message needs a fallback; on the deployed, same-origin site
  the header is readable.
- **Check claims against the code before publishing them.** A pull request first said the login form
  showed the API's 429 message; reading `api.ts` showed it did not, which became a fix of its own.

*(Tests in #46, rate limiting in #47 and #48, invites in #49, the production deploy in #50, pruning in
#51; released as v0.5.0.)*

---

## Stage: Observe and recover (issue #54, milestone #5, released as v0.6.0)

**Decisions:** observability and recovery came before separate environments, because nobody would
have noticed an outage and nothing beyond Neon's 6-hour window protected the data. In order:
- encrypted nightly backups with a restore drill;
- one structured log line per API request;
- uptime alerts through the proxy;
- a runbook, with its rotation procedure exercised.

**What happened:** the first real restore drill failed, on a Windows path bug in the drill itself,
fixed in #56. The rerun restored production's backup and matched the independently recorded audit
anchor. A deliberate test outage emailed the owner. Both read-only database passwords were rotated
live, and both jobs passed afterwards.

**Concepts learned:**
- **A backup nobody has restored is a hope.** The drill is part of the backup, not an extra: its first
  run against a real backup found a bug that the local rehearsal had not exercised.
- **Encrypt before the data leaves, with a key the storage never sees.** Dumps are piped straight into
  `age` inside the runner, to a public key. GitHub, and anyone who can read this public repository's
  artifacts, only ever holds ciphertext. The private key is the single point of recovery, so its custody
  (the password manager) is part of the design.
- **Authenticated encryption turns corruption into an error.** A truncated or altered backup fails to
  decrypt instead of restoring silently wrong data.
- **Prove a backup is the history you witnessed, not just that a file exists.** The drill checks the
  restored audit chain against the newest anchor the backup should contain, which proves it complete
  and unaltered. A full `pg_restore` creates triggers after loading data, so the stored hashes survive.
- **One credential per job, and least privilege for each.** `backup_reader` reads every table;
  `audit_verifier` reads one; neither can change anything, and default privileges keep future tables
  in the backups.
- **Logs are a security surface.** One JSON line per request, with a request ID returned to the caller,
  but never cookies, headers, query strings or bodies. A test sends every secret through the real API
  and checks none reaches the output. A client-sent request ID is never trusted, or one request's line
  could pose as another's.
- **Information known deeper in the stack can flow back out.** The logger sits outermost but needs the
  verified visitor and the user; inner layers fill a slot the logger put in the request context.
- **Monitor the path users take, and watch what monitoring costs.** One check through the site covers
  Cloudflare, the proxy, the secret, Render and the API. It deliberately never touches the database: a
  check every 5 minutes would keep Neon awake past the free plan's compute allowance.
- **Test the alert, not just the monitor.** A monitor that is green proves nothing about whether an
  alert reaches a person; a deliberate outage did.
- **A runbook is only trustworthy where it has been exercised.** Rotation was rehearsed live; the
  steps not yet run are labelled as such. Writing them surfaced a real trap: targeting the Pages project
  in Terraform also pulls in Render, which cannot be updated on the free plan.
- **Shared files conflict.** Two branches appending a test to one file and a line to one changelog
  section needed a manual merge; a stash popped onto the result conflicted too. Keeping both sides, then
  re-running the whole suite, is the reliable fix.
- **Check claims before writing them down.** A draft said the free plan had no test-alert button (it
  does, per monitor) and that a Terraform provider "was not worth it" (none was evaluated); both were
  corrected before merging.

*(Backups in #55 and #56, request logs in #57, the proxied health check in #58, the deploy in #59,
monitoring in #60, the runbook in #61; released as v0.6.0.)*

---

## Stage: Hardening review (issue #63, milestone #6, released as v1.0.0)

**Decisions:** the last gaps before the deployment could honestly be called hardened, chosen over
separate environments (deferred: all free Render services share 750 hours a month, and production
already uses about 744). In order:
- password change, "log out everywhere", admin-issued resets, and a command-line reset for a locked-out
  only admin;
- `PROXY_SECRET` rotation without refusing anyone;
- a weekly passive scan of the live site (OWASP ZAP baseline);
- operational hygiene: Node 24 actions, schedules that cannot pause, a Render hours check, a second
  backup copy;
- the 1.0.0 review, with a restore drill of both backup copies.

**What happened:** every piece went live, and three drills surfaced real problems. The browser check of
password change found the API's CORS preflight never listed `PUT`. The first live secret rotation found
`set-render-env.sh` could not set a value at all. And after that rotation, the next frontend deploy
refused every API call for about two minutes: Terraform had written a wrong value to the proxy's secret,
which Cloudflare never shows back. Each was fixed with a test or a check that would catch it again, and
the outage is recorded in the project state.

**Concepts learned:**
- **A changed password must end the other sessions.** Otherwise whoever stole a session keeps it.
  Change keeps the current session, reset and "log out everywhere" end all of them, and a change needs
  the current password, so a stolen session alone cannot lock the owner out.
- **No one resets their own account through the app.** An admin's stolen session must not be enough to
  take over that admin. The way back for a locked-out only admin is the command line, which needs the
  database login: the same trust as the `invite` command that created the first admin.
- **Overlap credentials to rotate them.** Two places cannot change a secret at the same instant, so for
  a few minutes the API accepts the old and the new one, and marks requests that used the old one. When
  the marks stop, the old one goes. 570 probe requests during the live rotation; none refused.
- **A drill's verdict must include the next deployment.** The rotation passed every check at the time;
  the damage surfaced on the following deploy. The fix was structural (one writer for the secret, and a
  health check at the end of every frontend deploy), not a note to be more careful.
- **Never let a tool write what it cannot read back.** Cloudflare returns no secret values, so Terraform
  reported "No changes" over a wrong one. Now Terraform sets the proxy's secret once and ignores it.
- **Browsers catch what server tests cannot.** CORS, CSP and cross-origin isolation live in the browser.
  The integration tests called the API directly; the `PUT` preflight only failed in a real page, and a
  test now covers it.
- **Passive scanning is cheap and finds real things.** ZAP's first run found inline styles allowed for
  no reason (the production build has none), Cloudflare's default wildcard CORS on static files, and
  missing HSTS; then a permissions policy and cross-origin isolation cleared the rest.
- **Read a credential's real capabilities, not its preset's name.** Backblaze's "Write Only" key could
  delete files and change retention. What protects the backups is a compliance-mode lock that each
  upload sets on itself, which nobody can shorten.
- **Check a credential before storing it.** The first B2 key failed in CI, most likely a newline from a
  clipboard pipe. The second was tested against Backblaze before being stored as exact bytes.
- **A backup copy counts only once it has been restored.** The copy downloaded from Backblaze was
  restored and checked against the audit anchor, the same as the GitHub one.
- **When no API reports a limit, project the worst case.** Render does not expose hours used, so the
  weekly check assumes every free service stays awake and fails above 750.
- **Quiet projects need their safety nets most.** GitHub pauses scheduled workflows after 60 days
  without commits; re-enabling them through the API restarts that clock without fake commits.
- **Local security software is part of the environment.** Avast intercepted Docker's HTTPS twice this
  stage: the three provider hosts after a restart, then the drill's package server. The exceptions are
  recorded per machine in the project state.
- **Semantic versioning starts meaning something at 1.0.0.** From here, a major version for anything
  that breaks the HTTP API or how it is run, a minor one for features, a patch for fixes.

*(Password change and resets in #64 to #66 and #77; rotation in #67 to #69 and #71; ZAP in #70; hygiene
in #72 to #76; released as v1.0.0.)*

---

## Stage: Frontend redesign (issue #79, milestone #7, built 2026-11-25 on `redesign`, heads for v1.1.0)

**Decisions:** the interface was the plain one the app started with, so the owner asked for a full
overhaul with its own identity. For this stage the code was written for the owner and explained, an
exception to the usual rule that the owner types it. The choices, all in
`docs/adr/0001-frontend-design-system.md`:
- A watchtower at night: deep ink-blue with one ice-blue signal colour, and severity on its own scale so
  the signal never reads as danger. Why: an incident tracker is opened when something is wrong, so it
  should look calm, precise and awake.
- A mark (Facet) drawn in straight lines from one geometry file, so every logo and icon agrees.
- Plain CSS tokens and a class prefix per area, not a framework. Why: the content security policy
  forbids the style injection most CSS-in-JS needs, and the spec allowed no new packages.
- Fonts as `@fontsource` packages, because the CSP allows no other origin and a font CDN would tell a
  third party who visits.
- Motion with presets and one reduced-motion rule, kept loud on the landing and sign-in pages and quiet
  in working screens.
- System theme with a toggle. Frontend tests (Vitest) as a CI step, closing the oldest known gap.
- A long-lived `redesign` branch with one pull request per task, and a single launch pull request into
  `main`, because every merge to `main` deploys to production and nothing half-finished should go public.

**What happened:** the work, tasks 0 to 15a, went into `redesign` as reviewed pull requests, with the owner signing
off the logo, the brand board and the first redesigned screen (sign-in) before the rest followed. Reviews
found real bugs in each task: a failed load that fed a misleading overview, focus lost after creating an
incident, a reset link that kept a "Copied" state after it was replaced. The last task, 15a, audited the
whole thing for accessibility, performance and motion, and fixed what it found (app-wide route focus, an
idle animation that looped forever, a chart readable only by hover, lazy routes). 289 tests pass.

**Concepts learned:**
- **Design tokens.** Colours, spacing, radii, timings and stacking order are named custom properties in
  one file, and two themes redefine the same names. A screen never hard-codes a value, so a re-theme is
  one file. Naming by role (`--color-text-muted`) rather than by value is what lets light and dark share
  the names.
- **CSP-safe styling.** With `style-src 'self'` there are no inline `<style>` tags or `style=""`
  attributes in HTML, but styles set from JavaScript through the CSSOM are allowed. That is why Motion
  and React work and why the production build links its CSS from files. The theme is chosen by a
  `data-theme` attribute set from a bundled script before first render, not by an inline script, so
  there is no flash.
- **Motion and reduced motion.** Animate only transform and opacity where possible, give each animation
  a job, and make `prefers-reduced-motion` a first-class path: the presets turn into short fades and
  content is visible from frame one, so nothing waits on an animation. Reduced motion is a preference,
  not a pause control.
- **Route focus management.** In a single-page app a route change replaces the page without a reload, so
  a keyboard or screen-reader user's focus stays on a control that may no longer exist. The fix is to move
  focus to the new page's `h1` after each navigation (waiting for the heading when the screen is a lazy
  chunk), set a page title, and not steal focus if the person has already moved it.
- **Lazy routes and error boundaries.** Splitting the signed-in screens into chunks cut JavaScript on
  public pages from 469.03 kB to 427.96 kB. The price is a new failure: a chunk can fail to load. A route
  error boundary keeps the header and footer on screen and says what happened.
- **WCAG 2.2.1 and 2.2.2.** 2.2.1 (timing adjustable): error toasts never auto-dismiss, because a person
  may need more than 5 seconds to read one; success toasts that only confirm what is on screen may.
  2.2.2 (pause, stop, hide): motion lasting over 5 seconds needs a way to stop. The landing page's scan
  looped every 8 seconds, so it now plays once and ends about 4.2 seconds in.
- **Colour is not the only cue.** Severity has a four-bar meter and status a glyph, so the badges work
  in forced-colours mode, in greyscale and for colour-blind readers.

**Lessons:**
- **A secret scanner cannot tell a fake from a real key.** gitleaks scans every commit and flagged a
  made-up token in a test fixture as a generic API key. A later commit cannot clear a finding that is
  already in history, so the fixture had to be rewritten out of the branch. Fixtures now use plain words
  (`first_token`) that match no secret pattern, which beats an ignore file that would also hide a real
  leak with a similar shape.
- **jsdom has no layout.** A test can assert a class or an attribute, never that a long title wraps.
  Layout, motion and real focus were checked by hand in a browser, and the README says so.
- **Tests that pass vacuously.** A reduced-motion test that checked an element was visible passed even
  when the animation snapped, and a change-animation test passed with no animation. The fix was to make
  each test fail first (remove the behaviour, watch it fail, restore it) before trusting it.
- **Timing-sensitive assertions flake under load.** Title, hash and lazy-screen checks failed only when
  the whole suite ran together. Wrapping them in `waitFor` and importing lazy screens up front made three
  full runs in a row green.
- **Disabled controls lose focus.** Disabling a button while a save runs drops focus to the page, so
  focus had to be handed back afterwards, and not when the person had already moved on.
- **A headline number has to match the chart beside it.** "5 open" next to a status chart saying "Open 4"
  looked like a bug, because the headline counted open and investigating. The text now says "open or
  investigating".

*(Tasks 0 to 15a merged into `redesign`; documentation and screenshots in 15b. Release to follow the
launch pull request.)*

## Frontend follow-ups from the launch review (2026-11-26, branch `feat/launch-follow-ups`)

- **robots.txt.** The SPA fallback had been answering `/robots.txt` with `index.html`. The routes to
  disallow are the real ones in `App.tsx`: `/account` and `/admin` (the review said `/incidents` and
  `/users`, which are not paths; the incident list is `/` once signed in), plus `/invite`, `/reset`
  and `/api/`.
- **24 px targets.** A 20 px text line plus 2 px padding each side makes the target, and an equal
  negative margin keeps the footer's layout unchanged. Only the public shell has a footer. A link
  inside a sentence is exempt from WCAG 2.5.8, so the credit's link was left alone.
- **Returning after expiry.** The place rides in router location state (`history.state`), never
  storage, and is validated on write and again on read (`src/returnTo.ts`). Lesson: signing in makes
  the `/signin` route's "already signed in, go home" guard render before the page's own `navigate`
  runs, so the guard had to honour the remembered place too; the first test caught it.
- **Shared kit classes.** The three copies of each rule were byte-identical, so they moved to
  `src/ui/Text.css` unchanged. Checked in a browser: 17 computed properties and the box height of the
  h1, h2 and error text on all three pages were the same before and after.
- **aria-invalid.** The API answers a wrong current password with 403; other failures (400, 429) say
  nothing about that field.
- **Built HTML test.** `build.test.ts` already built in memory, so it now builds once with
  `VITE_API_URL` empty and checks the HTML against the CSP rules. Writing nothing to `dist` means it
  cannot disturb anything using that folder.
- **Dev server note.** The API's CORS allows only `http://localhost:8081`, and the Vite config has no
  `/api` proxy, so a dev server on another port cannot sign in; use 8081 for browser checks.

---

## 2026-11-26: Transactional audit for sign-in and sign-out

**Decision:** a successful sign-in and a sign-out now commit their session change and its audit entry in
one transaction, the rule role changes have followed since the audit stage. If the entry cannot be
written, the request answers 500 and nothing changes: a sign-in creates no session and sets no cookie,
and a sign-out leaves the session and the cookie in place. Failed sign-ins stay best effort.

**Why it was asymmetric before:** at the audit stage, login and logout had no transaction to join, so
they wrote their entry on its own connection and only logged a failure. That left a gap: with the audit
insert failing (a full disk, a broken trigger, a revoked grant), people could sign in and out with no
record at all, which is the one thing an audit trail must never allow.

**What was already transactional:** the stage's other events had been built that way from the start:
password change, log out everywhere, invite issued and accepted, reset issued and used, and the
`invite` and `reset-password` subcommands, which call the same functions. They had no automated proof,
though; the role change had only been fault-injected by hand.

**Why failed sign-ins stay best effort:**
- Nothing changed, so there is nothing to roll back.
- The login limiter counts only 401 responses. If a lost entry turned a failed sign-in into a 500,
  wrong guesses would stop counting exactly while the audit log is broken, which is when nobody is
  watching.
- The response has to be the same 401 whatever the reason, so it cannot carry the audit outcome anyway.

**Concepts learned:**
- **A shared fate needs a shared transaction.** Two writes on two connections can each succeed or fail
  alone. `BeginTx`, both writes on the same `*sql.Tx`, then `Commit`, and a deferred `Rollback` for
  every early return, is what makes them one unit.
- **Pass the transaction in, not the pool.** `session.Create` and `DeleteByTokenHash` now take a
  `rowQuerier` or `execer`, the same small interfaces the user and audit packages already use, so the
  caller decides which transaction they join.
- **Side effects outside the database come after the commit.** The cookie is the sign-in's only
  effect the database cannot undo, so it is set only once the commit has succeeded.
- **Order statements to keep lock time short.** The audit trigger takes a transaction-scoped advisory
  lock that every audit insert waits on until commit. Running the audit insert last, right before the
  commit, means the lock covers only the insert and the commit, the same window a role change holds it
  for. A sign-in keeps bcrypt and its user lookup outside the transaction; a sign-out takes the
  session's row lock first, then reads its owner, then writes the entry.
- **`DELETE ... RETURNING` says what you actually removed.** Reading a row and then deleting it are two
  steps another request can slip between. Taking the owner from the deletion itself means only the
  request that really ended the session learns who it was: a second sign-out with the same cookie
  waits on the row lock, then deletes nothing.
- **Fault injection with a narrow trigger.** The tests install a test-only `BEFORE INSERT` trigger on
  `audit_log` that fails only entries matching one action and one actor or target. Revoking `INSERT`
  would have failed every audit write in the shared test database. A `SELECT` cannot carry a trigger,
  so the sign-out's user lookup is failed another way: a test-only `AFTER DELETE` trigger on
  `sessions` empties that transaction's `search_path`, and the lookup that follows cannot find
  `users`. Each sign-in and sign-out test then runs `audit.Verify` itself and finds the chain intact,
  because a rolled-back insert leaves no row.

**Verified:** the new tests for sign-in and sign-out failed against the old code (200 and 204 where 500
was expected) and pass now; the full backend suite, `go vet` and `govulncheck` are clean.

**Fixed in review (PR #103):**
- *A sign-out could still commit without its entry.* The session and user lookups ran before the
  transaction, and any error other than not-found (a timeout, an exhausted pool) left nobody to name,
  so the deletion committed with no entry. Two sign-outs with one cookie could also both write an entry
  for one deletion. The owner now comes from `DELETE ... RETURNING user_id` inside the transaction, any
  lookup error is a 500, and only "no live session deleted" skips the entry (still a 204).
- *A failed sign-out looked successful.* The frontend's Log out cleared its own state whatever the
  server said, so with the audit log broken a person on a shared computer would see the front door
  while their session and HttpOnly cookie survived. Now only a 204, or a 401 (already signed out),
  signs the browser out; anything else, a network error included, keeps the person signed in with an
  error toast that stays until dismissed. "Log out everywhere" on the Account page already behaved
  this way: it stays put and says why.
- A test proves wrong passwords still reach the limiter's 429 while their audit entries fail.

*(Committed on `feat/transactional-auth-audit`.)*

---

## Questions to revisit later
- ~~Revisit if the Go learning curve slows the security/cloud learning too much~~ Settled at 1.0.0: the
  whole backend is Go, and it did not.
- ~~Account enumeration~~: closed in v0.5.0 by removing open sign-up; accounts come from invites.
- ~~Expired `sessions` rows are never cleaned up~~: pruned on login, at most hourly, since v0.5.0.
- Render's Terraform provider cannot update free-plan services (render-oss/terraform-provider-render#80).
  When a release includes the fix (#105), return to `terraform apply` and delete `infra/deploy-api.sh`.
  Still open upstream at 1.0.0 (latest provider release v1.9.1), so it stays a known gap.
- ~~`actions/checkout` v4.4.0 runs on Node.js 20~~ Resolved 2026-11-24: every action on Node.js 24.
- ~~Scheduled workflows pause after 60 days without a commit~~ Resolved 2026-11-24: a monthly workflow
  re-enables them through the API.
- ~~`PROXY_SECRET` rotation is written in the runbook but has never run~~ Resolved 2026-11-24: the API
  accepts `PROXY_SECRET_PREVIOUS` during a rotation, which ran live with no refused requests.
- ~~Backups live 90 days as GitHub artifacts, all under one GitHub account~~ Resolved 2026-11-25: a
  second copy goes to Backblaze B2, locked for 90 days. Lesson for the stage entry: Backblaze's "Write
  Only" key preset includes `deleteFiles`; read a key's actual capabilities, not its preset's name.
- ~~Since 2026-11-26 a sign-out can fail with a 500 when the audit log is broken, and the frontend's
  Log out then clears local state while the session survives~~ Resolved 2026-11-26 in PR #103: the
  person stays signed in and an error toast says the sign-out did not complete.
- A wrong current password on `PUT /api/me/password` writes its failure entry strictly: a lost entry
  becomes a 500, which the change limiter (it counts 403s) does not count. Failed sign-ins were kept best
  effort for exactly that reason. Should this failure entry follow them?
