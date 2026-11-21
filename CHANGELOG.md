# Changelog

All notable changes to SentinelOps are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is `0.y.z` the project is in initial development: each roadmap stage
ends in a minor release, and fixes between stages are patch releases. `1.0.0` will be the
first hardened production deployment on AWS.

## [Unreleased]

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

[Unreleased]: https://github.com/rehrabbi/SentinelOps/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rehrabbi/SentinelOps/releases/tag/v0.1.0
