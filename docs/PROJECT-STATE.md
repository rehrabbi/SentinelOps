# Project State — Resume Here

> **Snapshot for continuing on any device.** Read `docs/WAYS-OF-WORKING.md` first (how
> we collaborate), then this file (where we are + what's next). `docs/learning-log.md`
> has the blow-by-blow history.
>
> **Last updated:** 2026-08-13 · **Current stage:** Authentication (login) — mid-build.

---

## 1. How to resume on a new device

1. Clone the repo and open the folder in VSCode.
2. Tell Claude: *"Read docs/WAYS-OF-WORKING.md and docs/PROJECT-STATE.md, then re-orient
   per the Session behavior section and continue."* (Re-paste the operating manual too if
   you have it — but WAYS-OF-WORKING.md captures all of it.)
3. Claude should summarize state, confirm the next step below, and wait for your go-ahead.
4. **Prerequisites on the new device:** Docker Desktop, Go 1.26+, Node.js + npm, git.
   Recreate the git-ignored `backend/../.env` (see `.env.example`) — it holds the
   Postgres credentials (never committed).

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
| Repo | **Monorepo** (`backend/`, `frontend/`, `docs/`), **private** GitHub | keep real email in commits |
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

**Authentication (in progress):**
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
  handlers + upcoming middleware).

---

## 5. What's built and working

**Endpoints live:** `GET /healthz` (liveness), `GET /readyz` (DB readiness),
`GET /api/users` (list), `POST /api/users` (register — tested 6/6: 201, dup→409,
short pw→400, bad email→400, unknown field→400, DB shows real `$2a$10$…` bcrypt hash).

**Files:**
- `backend/main.go` — routes + CORS middleware + `migrate` subcommand + manual DI.
- `backend/db.go` — `openDB` (sql.Open + pgx, pool tuning).
- `backend/migrate.go` — `go:embed` migrations, `runMigrateUp`.
- `backend/migrations/000001_create_users.{up,down}.sql`
- `backend/migrations/000002_create_sessions.{up,down}.sql` (applied; schema_migrations=2)
- `backend/internal/user/{user.go, repository.go, handler.go, validate.go}` —
  repository now includes `GetByEmail` (loads `password_hash`) + `ErrUserNotFound`.
- `backend/internal/session/{session.go, repository.go}` — Session model; `GenerateToken`
  (crypto/rand, 32 bytes), `HashToken` (SHA-256), `Repository.Create`.
- `frontend/` — React+Vite+TS; `src/App.tsx` fetches `/healthz` (not yet wired to auth).

**Git:** on `main`, pushed. Recent commits: sessions migration (000002), user creation
endpoint, users read API, golang-migrate + users table, Postgres via Docker Compose.

**Runtime state:** Docker container `sentinelops-db` (Postgres 17) runs the DB. Seeded
test users exist: `alice@`/`bob@` have FAKE hashes (cannot log in — clean up later),
`carol@example.com` has a REAL bcrypt hash from the registration test.

---

## 6. ⏭️ THE EXACT NEXT STEP (Authentication login build)

We're mid-way through building login as small typed steps. **Done: Steps 1–3.**
**Next: Step 4 — create `backend/internal/auth/handler.go`** (I type it; Claude checks).

Build plan:
| Step | File | Status |
|---|---|---|
| 1 | `internal/session/session.go` (Session model) | ✅ done |
| 2 | `internal/session/repository.go` (token gen + Create) | ✅ done |
| 3 | `internal/user/repository.go` (add `GetByEmail`) | ✅ done |
| 4 | `internal/auth/handler.go` (Login handler) | ⏭️ **NEXT — type this** |
| 5 | `main.go` (wire auth handler, register `POST /api/sessions`, CORS-credentials tweak) | ⬜ pending |

### Step 4 code to type — `backend/internal/auth/handler.go` (new file)

Create folder `internal/auth`, then file `handler.go`, and type/paste:

```go
// Package auth implements authentication behavior: logging in (creating a
// session), logging out, and (soon) the middleware that protects routes.
package auth

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sentinelops/internal/session"
	"sentinelops/internal/user"
)

const (
	// cookieName is the name of the session cookie in the browser.
	cookieName = "sentinelops_session"
	// sessionTTL is how long a login session stays valid (our 7-day decision).
	sessionTTL = 7 * 24 * time.Hour
)

// dummyHash is a precomputed bcrypt hash used ONLY to equalize response timing
// when a login targets an email that doesn't exist. Running a real bcrypt
// comparison in that case makes "no such user" take about as long as "wrong
// password", so an attacker can't use response time to discover which emails
// are registered.
var dummyHash []byte

// init runs once when the package loads, precomputing the dummy hash.
func init() {
	h, err := bcrypt.GenerateFromPassword([]byte("timing-equalizer-not-a-real-password"), bcrypt.DefaultCost)
	if err != nil {
		panic("auth: cannot precompute dummy hash: " + err.Error())
	}
	dummyHash = h
}

// Handler wires the user and session repositories together to implement login.
// It depends on BOTH domains, which is why it lives in its own auth package.
type Handler struct {
	users         *user.Repository
	sessions      *session.Repository
	secureCookies bool
}

// NewHandler builds an auth Handler. secureCookies controls the cookie's Secure
// flag: false for local http development, true in production over HTTPS.
func NewHandler(users *user.Repository, sessions *session.Repository, secureCookies bool) *Handler {
	return &Handler{users: users, sessions: sessions, secureCookies: secureCookies}
}

// loginInput is the request body for POST /api/sessions.
type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login handles POST /api/sessions: verify credentials, then create a session.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	// Same input hardening as registration: cap the body, parse strictly.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var in loginInput
	if err := dec.Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	in.Email = strings.TrimSpace(in.Email)

	// 1) Find the user. A missing user must fail the SAME way as a wrong
	// password: generic message, same 401, similar timing.
	u, err := h.users.GetByEmail(r.Context(), in.Email)
	if err != nil {
		if errors.Is(err, user.ErrUserNotFound) {
			// Equalize timing with a throwaway bcrypt compare, then fail generically.
			bcrypt.CompareHashAndPassword(dummyHash, []byte(in.Password))
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}
		log.Printf("login: get user: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// 2) Verify the password against the stored bcrypt hash.
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)); err != nil {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	// 3) Credentials valid — mint a session token and store only its hash.
	rawToken, tokenHash, err := session.GenerateToken()
	if err != nil {
		log.Printf("login: generate token: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	expiresAt := time.Now().Add(sessionTTL)
	if _, err := h.sessions.Create(r.Context(), tokenHash, u.ID, expiresAt); err != nil {
		log.Printf("login: create session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// 4) Send the RAW token to the browser in a hardened cookie. The database
	// holds only its hash, so this cookie is the only copy of the secret.
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    rawToken,
		Path:     "/",
		HttpOnly: true,                 // JS cannot read it -> XSS can't steal it
		Secure:   h.secureCookies,      // HTTPS-only in production
		SameSite: http.SameSiteLaxMode, // not sent on cross-site sub-requests -> CSRF defense
		Expires:  expiresAt,
		MaxAge:   int(sessionTTL.Seconds()),
	})

	// 5) Respond with the logged-in user. PasswordHash was loaded for step 2,
	// but its json:"-" tag guarantees it is never serialized here.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(u); err != nil {
		log.Printf("login: encode response: %v", err)
	}
}
```

After Step 4 builds, **Step 5** (main.go) will: construct `sessionRepo` and
`authHandler` (with a `secureCookies` bool read from an env var, default false for local
http), register `mux.HandleFunc("POST /api/sessions", authHandler.Login)`, and update
`withCORS` to add `Access-Control-Allow-Credentials: true` (and reflect the specific
allowed origin) so the browser will store/send the cookie cross-origin. Then test login
with curl (200 + `Set-Cookie`; wrong password → 401; verify a `sessions` row appears).

---

## 7. After login: remaining auth pieces, then roadmap

Immediate next (after login works): **auth middleware** (read cookie → `HashToken` →
look up session → reject if missing/expired → attach user to request context),
**logout** (`DELETE /api/sessions/current`), then **wire the frontend** login form.

Then the broader roadmap (guide, not auto-permission): authorization/RBAC → incident
features → file/evidence handling → audit logging → security hardening → automated tests
→ Docker for the app → CI → security scanning → AWS architecture → Terraform →
deployment → CDN/WAF/TLS → monitoring/alerts → attack testing → reliability/backup →
cost/perf review → production hardening → documentation/portfolio review.

---

## 8. How to run locally (quick reference)

```bash
# 1) Start Postgres
docker compose up -d

# 2) Apply migrations (from backend/, with DATABASE_URL built from .env — never printed)
#    DATABASE_URL = postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@127.0.0.1:5432/<POSTGRES_DB>?sslmode=disable
go run . migrate

# 3) Run the API (same DATABASE_URL)
go run .

# 4) Run the frontend
cd ../frontend && npm install && npm run dev
```

> On Windows, Go lives at `C:\Users\<you>\AppData\Local\Programs\Go` (portable ZIP, no
> admin). PowerShell subprocess PATH can be stale — refresh from Machine+User env, or
> prepend `.../Go/bin` to PATH in the shell.
