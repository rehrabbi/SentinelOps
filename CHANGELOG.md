# Changelog

All notable changes to SentinelOps are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is `0.y.z` the project is in initial development: each roadmap stage
ends in a minor release, and fixes between stages are patch releases. `1.0.0` will be the
first hardened production deployment.

## [Unreleased]

### Added

- `PROXY_SECRET` can be rotated without refusing anyone. During a rotation the API also accepts
  `PROXY_SECRET_PREVIOUS`, compares both in constant time, warns at every start while it is set, and
  marks each request it let in with `"proxy_secret":"previous"` in the request log, so it is clear
  when the proxy has switched. It refuses to start with a previous secret but no current one.
- `infra/set-pages-secret.sh` sets the proxy's secret with wrangler from a pipe, and
  `infra/probe-site.sh` fetches `/api/healthz` through the site every second during a change,
  reporting every answer that is not 200. `infra/set-render-env.sh` can set and delete
  `PROXY_SECRET_PREVIOUS`.

- Changing your own password, from a new **Account security** page (`PUT /api/me/password`). It
  needs the current password, follows the same rules as accepting an invite, ends every other session
  of yours while keeping the one you are using, and is recorded in the audit log, failures included.
  Wrong current passwords are limited like logins: 10 per visitor in 15 minutes.
- **Log out everywhere** (`DELETE /api/sessions`): ends every session of yours, on every device,
  including the current one, and records how many ended.
- Admin-issued password resets, so a forgotten password is no longer a permanent lockout. On the
  Users screen an admin creates a one-time link for any other account, admins included
  (`POST /api/users/{id}/password-reset`). Like an invite it is stored only as a SHA-256 hash and shown
  once, but it lasts 1 hour, and issuing a new one retires any earlier unused one. Following it
  (`/reset#<token>`, `POST /api/password-resets/accept`) sets the new password and ends every session
  of that account. Using links is limited to 10 per visitor per hour. Both steps are audited.
- Migration 7, `password_resets`.

### Changed

- Pruning also deletes password resets a week after they are used or expire.
- The admin screen is now titled **Users**, and the logged-in view links to Account security.

### Fixed

- `infra/set-render-env.sh` could not set a value: it gave curl both the API key and the request
  body on standard input, so the body arrived empty and Render refused it. Found by the first live
  rotation; it now sends the update with Python's standard library.
- The API's CORS preflight now allows `PUT`. It listed every method but that one, so a browser
  refused the password change in local development, where the site and the API are separate
  origins. A test now checks the preflight for every method the API uses.

## [0.6.0] - 2026-11-22

Observe and recover: production now announces its failures and can be recovered. The database is
backed up nightly, encrypted before it leaves the CI runner, and a restore drill proves each backup
restores and matches the audit anchors; every API request leaves one structured log line; uptime
monitoring emails the owner within minutes of an outage; and a runbook covers each failure, with its
rotation procedure exercised.

### Added

- Nightly backups of the production database, kept for 90 days as workflow artifacts. Each is
  dumped through `backup_reader`, a role that can read every table and change nothing, and
  encrypted with `age` inside the runner before anything is stored.
- One structured (JSON) log line per API request: request ID, method, path, status, duration,
  bytes, visitor key, and the user ID when logged in. The request ID is returned to the caller as
  `X-Request-ID`, so a reported problem can be matched to its line. The server's other log
  messages use the same JSON format.
- `GET /api/healthz`, a liveness check that requires the proxy secret, so one external check fetched
  through the site covers Cloudflare, the proxy, the secret, Render and the API. It never touches the
  database, so frequent checks do not keep it awake.
- Uptime monitoring with UptimeRobot's free plan: the site and `/api/healthz` (through the proxy) are
  checked every 5 minutes, with an email to the owner when either stops answering.
- `docs/RUNBOOK.md`: what to do when Audit verify or Backup fails, how to restore data at three
  scales, how to handle an outage, and how to rotate each secret.
- `infra/rotate-readonly-role.sh`, which gives `audit_verifier` or `backup_reader` a new password and
  stores the new connection string in its GitHub environment, and `infra/set-render-env.sh`, which
  sets `PROXY_SECRET` or `DATABASE_URL` on Render from a pipe. Secrets pass only through pipes.
- `infra/restore-drill.sh`, which restores the newest backup into a throwaway database, checks
  its schema version, and verifies its audit chain against the newest anchor it should contain.

### Security

- Backups are encrypted to a public key; the private key exists only with the owner, so neither
  GitHub nor anyone who can read this public repository's artifacts can read a backup.
  Encryption is authenticated, so a truncated or altered backup fails to decrypt rather than
  restoring silently.
- Request logs never contain cookies, headers, query strings, or request and response bodies, so
  passwords, session tokens, invite tokens and the proxy secret cannot reach them; a test sends all
  of them and checks the log. Request IDs are always generated by the server, never taken from the
  client.

## [0.5.0] - 2026-11-22

Harden the live app: the gaps the public deployment exposed are closed. Login is rate limited
per visitor, accounts come only from one-time invites so no one can learn which emails are
registered, expired sessions and spent invites are deleted, and the API's behaviour is covered by
integration tests that run against Postgres on every pull request.

### Added

- Integration tests that drive the real API, its router, middleware and SQL, against a
  throwaway Postgres on every pull request. They cover invites, login, sessions and the
  cookie's flags, RBAC, per-object authorization, role changes, the append-only audit chain,
  and the proxy secret. Each run uses its own database, and the tests refuse any host but
  `localhost`.
- One-time invites: an admin issues one from the admin screen, and the person it is for opens
  the link, chooses a name and password, and is logged in. Invites last 24 hours, work once,
  and are audited when issued and when accepted.
- `invite`, a command-line subcommand that issues an invite with database access instead of an
  admin session. It is how the first admin of a fresh database gets an account.

### Changed

- When login is rate limited, the login form says so ("Too many failed attempts") and, on the
  deployed site, how many minutes to wait, instead of a generic "Login failed (429)".

### Removed

- Expired sessions, which were refused but never deleted. They are now removed on the first
  successful login each hour, and invites a week after they are used or expire.
- Open sign-up: `POST /api/users` and the registration form. Accounts now come only from
  invites.

### Security

- Account enumeration is closed: with no open sign-up, no endpoint reveals whether an email has
  an account. Invite tokens are 256-bit, stored only as SHA-256 hashes, returned once with
  `Cache-Control: no-store`, and carried after `#` in the link so they never reach a server log.
- Login is rate limited per visitor: after 10 failed attempts in 15 minutes, further attempts get
  `429 Too Many Requests` with `Retry-After`, before any password is checked. Correct logins never
  count, and a success does not reset the count.
- Accepting invites is limited to 5 per visitor per hour, counting accounts created, taken
  addresses, and unusable tokens.
- Visitors are identified only by the address the proxy reports behind its secret, or the
  connection's own; IPv6 addresses are grouped by /64. Concurrent requests cannot exceed a limit,
  and the limiter's memory is bounded, failing closed if it fills.

## [0.4.0] - 2026-11-22

Free cloud deployment: SentinelOps is live at https://sentinelops.pages.dev on the free plans
of Cloudflare Pages, Render and Neon, all declared in Terraform. A same-origin proxy keeps the
session cookie first-party, the API refuses requests that bypass it, and the audit chain is
verified every 6 hours against a head recorded outside the database.

### Added

- A Cloudflare Pages Function that forwards `/api/*` from the frontend's own address to the
  API, so the deployed site stays same-origin and the session cookie stays first-party. It
  always sets the proxy secret and the visitor's address itself, never passing on values the
  browser sent.
- A `_headers` file giving the Cloudflare-hosted frontend the same security headers as the
  container image, with `connect-src 'self'` because the API is reached through the proxy.
- A publish workflow that pushes the API image to GitHub Container Registry once the
  security scans have passed on `main`, tagged `sha-<commit>` (immutable) and `main`.
- A Terraform configuration in `infra/` with its state in a separate Neon database, provider
  versions pinned and locked for Windows, macOS, and Linux, and a CI job that checks its
  formatting and validates it on every pull request.
- `infra/terraform.sh`, which runs Terraform from HashiCorp's official container image so
  every machine uses the same version, reading the state connection string from `.env` and
  passing secrets to the container by name only. The state connection verifies Neon's
  certificate (`sslmode=verify-full`).
- The production deployment in Terraform: the database on Neon's free plan, the API on Render's
  free plan from the published image pinned by commit, and the frontend's Cloudflare Pages
  project, all in Singapore. `infra/terraform.sh` now reads every provider credential and input
  from `.env`.
- `infra/migrate.sh`, which applies migrations to the production database with the exact image
  about to be deployed, before Render is pointed at it.
- `infra/deploy-api.sh`, which deploys the pinned API image through Render's API and waits until
  it is live and healthy, because Render's Terraform provider cannot update a free-plan service.
- A deploy workflow that builds the frontend and uploads it with its proxy to Cloudflare Pages
  on every change to `main`, using `wrangler` pinned in `package-lock.json`.
- `verify-audit --anchor <id>:<hash>` checks that an earlier chain head is still in the audit
  log, and the command now prints the head in that form. The first unit tests cover the anchor
  parser.
- A scheduled workflow that verifies the production audit chain every 6 hours against the last
  recorded anchor, then records the current head on the `audit-anchors` branch.

### Security

- Each published image carries a signed build provenance attestation binding its digest to
  this repository, commit, and workflow, verifiable with `gh attestation verify`. The image
  is scanned again before it is pushed, with the same fail policy as pull requests.
- When `PROXY_SECRET` is set, the API answers only requests that carry it in `X-Proxy-Secret`,
  compared in constant time, apart from `/healthz`. This lets the API sit behind a proxy
  without being reachable around it. Unset, the check is off and the API logs that it is.
- Behind that proxy, the audit trail records the visitor's address that the proxy reports in
  `X-Client-IP`, trusted only on requests that passed the secret check and parsed before use.
  Everywhere else it still records the direct connection's address.
- The proxy secret is generated by Terraform and goes straight to the API and the proxy, so no
  person ever handles it. Terraform refuses to destroy the production database, and refuses to
  deploy an API image by a moving tag.
- The deploy workflow's Cloudflare token is held in a GitHub environment that releases it only
  to deployments from `main`, never to pull requests.
- The audit chain head is anchored outside the database, so a chain rebuilt by someone with
  database access is detected. The scheduled check connects as `audit_verifier`, a role that
  can only read `audit_log`.
- Terraform formatting and validation is now a required check on `main`, alongside the build,
  lint and scanning jobs, so a broken infrastructure change cannot merge.

## [0.3.0] - 2026-11-21

CI hardening: every pull request is now scanned for vulnerable dependencies, exploitable
code, vulnerable image packages, and leaked secrets, and the first scans found and fixed
three real problems before the scanning itself was merged.

### Added

- A security workflow that runs on every pull request, on `main`, and weekly: `govulncheck`
  for Go dependencies, `npm audit` for frontend dependencies, CodeQL static analysis of the
  Go and TypeScript code, Trivy for both container images and the container configuration,
  and gitleaks across the full git history. Findings are uploaded to the repository's
  Security tab.

### Fixed

- The Go toolchain moves to 1.26.11, removing 17 standard library vulnerabilities that the
  API's own code reaches.
- `vite` moves to 8.3.8, resolving a high severity advisory in the development server.
- The frontend image now installs Alpine's security fixes at build time and no longer ships
  `curl`, removing 14 fixable high and critical vulnerabilities from the base image.

### Security

- A build fails on any high or critical finding that has a fixed version; everything else is
  reported without blocking.
- GitHub secret scanning, push protection, and Dependabot alerts are switched on.
- Every GitHub Action is pinned to a full commit SHA, so a moved tag cannot change the code a
  workflow runs.
- All six scanning jobs are required checks on `main`, alongside the build and lint jobs, so
  nothing merges without passing them.

## [0.2.0] - 2026-11-21

Containerization: the whole stack now runs in containers, as an API image and a frontend
image matching the target architecture, with migrations as a one-shot job and health checks
that work without a shell.

### Added

- Multi-stage container image for the API: a static binary on a distroless base, about
  20 MB, with migrations embedded so image and schema cannot drift.
- Multi-stage container image for the frontend: the Vite build served by unprivileged
  nginx, with long-lived caching for fingerprinted assets and a fallback so client-side
  routes such as `/admin` survive a refresh.
- `api healthcheck` subcommand, which exits 0 when the running server answers `/healthz`
  within two seconds, so container health checks work in an image with no shell or curl.
- A Compose `app` profile that runs the whole stack: Postgres, a one-shot migration job,
  the API once migrations succeed, and the frontend once the API is healthy. Plain
  `docker compose up` still starts only the database.

### Security

- Both images run as non-root users, and the API image contains no shell or package
  manager.
- The frontend sends a Content Security Policy, `X-Content-Type-Options: nosniff`, and a
  strict referrer policy on every response, including errors. The policy's API origin is
  set when the container starts, not baked into the image.
- Secrets reach containers only at run time from the git-ignored `.env`, never through
  build arguments or image layers, and every published port is bound to `127.0.0.1`.

## [0.1.0] - 2026-10-24

The application as it stood before containerization: authentication, role-based access,
incident management and audit logging, plus the repository standards the project is
developed under.

### Added

- Go API on the standard library `net/http`, with `GET /healthz` for liveness and
  `GET /readyz` for database readiness.
- PostgreSQL 17 through Docker Compose, bound to localhost only, with five migrations
  embedded in the binary and applied by `go run . migrate`.
- Registration with `POST /api/users` and an admin-only user directory at `GET /api/users`.
- Login with `POST /api/sessions`, the current user at `GET /api/me`, and logout with
  `DELETE /api/sessions/current`, backed by server-side sessions with a seven-day expiry.
- Reporter, analyst and admin roles, and role changes by an admin with
  `PATCH /api/users/{id}`.
- Incidents: create with `POST /api/incidents`, list with `GET /api/incidents`, read with
  `GET /api/incidents/{id}`, and partially update with `PATCH /api/incidents/{id}`.
- React, Vite and TypeScript frontend with login, registration with automatic sign-in,
  logout, an incident dashboard with inline status changes, and an admin screen for roles.
- Append-only, hash-chained audit log recording logins, failed logins, logouts and role
  changes, with `go run . verify-audit` to check the chain.
- CI workflow that formats, vets, builds and tests the Go code and lints and builds the
  frontend on every pull request.
- MIT licence, security policy, contributing guide, code of conduct, code owners, issue and
  pull request templates.

### Security

- Passwords hashed with bcrypt, with a 12 character minimum and no composition rules,
  following NIST 800-63B.
- Login costs the same for an unknown email as for a wrong password, so response timing does
  not reveal which accounts exist.
- Session tokens are 256-bit random values in an `HttpOnly`, `SameSite=Lax` cookie; only
  their SHA-256 hash is stored, and the `Secure` flag is set by `SECURE_COOKIES`.
- Incidents are owner-scoped in SQL on every read and write by id, and another user's
  incident returns `404`, so existence never leaks.
- Roles are read from the database on every request; the user directory and role changes
  are admin only, and an admin cannot change their own role.
- A role change and its audit entry commit in one transaction.
- The audit log refuses `UPDATE`, `DELETE` and `TRUNCATE`, and every row is chained to its
  predecessor by a database trigger, so edits are detectable.
- Strict JSON decoding rejects unknown fields, request bodies are capped at 1 MiB, path
  identifiers are shape-checked before any query, and all SQL is parameterised.
- CORS allows one named origin with credentials, never a wildcard.

Known gaps at this version are listed in the README: registration reveals whether an email
is taken, there is no rate limiting, expired sessions are not pruned, there is no automated
test suite, and a database superuser can rebuild the audit chain undetected.

[Unreleased]: https://github.com/rehrabbi/SentinelOps/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/rehrabbi/SentinelOps/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rehrabbi/SentinelOps/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rehrabbi/SentinelOps/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rehrabbi/SentinelOps/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rehrabbi/SentinelOps/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rehrabbi/SentinelOps/releases/tag/v0.1.0
