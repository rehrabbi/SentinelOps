# Contributing

This is a personal learning project, so outside pull requests are not expected. The
conventions below are documented because the workflow itself is part of what the project
is practising, and because future me on a different machine needs them.

## Local setup

See the Quickstart in the [README](README.md). In short, copy `.env.example` to `.env`
and set a password, start Postgres with `docker compose up -d`, run `go run . migrate`
then `go run .` from `backend/`, and `npm install && npm run dev` from `frontend/`.

## Branching model

The project uses GitHub Flow.

- `main` is protected. It takes changes only through a pull request. Direct pushes, force
  pushes, and branch deletion are blocked, including for administrators.
- All work happens on a short lived branch cut from `main`, named `feat/<name>` for
  features and `docs/<name>` for documentation.
- One concern per branch and one concern per pull request.
- Merged branches are never deleted. On merge the branch is recreated as `merged/<name>`
  and pushed, and the old `feat/<name>` name is removed, so every feature's history stays
  in the repository.

Environment branches for `dev`, `staging`, and `prod` are planned, but only once there is
real infrastructure to deploy to. Until then they would be decoration.

## Commit messages

Use a conventional subject line, a blank line, then a body of short bullet points.

```
feat: add incident detail endpoint with per-object authorization

- add GET /api/incidents/{id} behind authentication
- scope reads by owner for reporters; analysts and admins may read any
- return 404 for missing, malformed, and unauthorized ids alike
```

Rules worth stating explicitly.

- Describe the change and its effect, not the internal implementation approach.
- One concern per commit.
- No co-author or AI attribution trailers. Commits are authored by the repository owner.
- Keep documentation changes in their own `docs:` commit, separate from code.

## Before opening a pull request

Run what CI runs, so nothing fails after the fact.

```bash
cd backend && gofmt -l . && go vet ./... && go build ./... && go test ./...
cd ../frontend && npm run lint && npm run build
```

Also check that no secret, `.env` file, or build artifact is in the diff, and that the
documentation in `docs/` still matches reality.

## Security changes

Anything touching authentication, authorization, session handling, or input validation
needs the threat it addresses written down in `docs/learning-log.md`, together with how
the change was verified. A security control without a recorded reason tends to get
refactored away later by someone who does not know why it exists.
