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
- All work happens on a short lived branch cut from `main`, named `<type>/<short-name>` in
  lowercase kebab case. The type is the same word the commits will use:

  | Prefix | For |
  |---|---|
  | `feat/` | A new capability visible to a user or an API client |
  | `fix/` | A defect, including a security defect |
  | `docs/` | Documentation only |
  | `build/` | Container images, dependencies, the build itself |
  | `ci/` | GitHub Actions workflows and other automation |
  | `refactor/` | Restructuring with no change in behaviour |
  | `chore/` | Repository housekeeping that fits none of the above |

- Branch names carry no issue number (`feat/compose-services`, not
  `feat/14-compose-services`). The pull request links the issue instead.
- One concern per branch and one concern per pull request.
- Merged branches are never deleted. On merge the branch is recreated as `merged/<name>`
  and pushed, and the old `<type>/<name>` name is removed, so every branch's history stays
  in the repository.

Environment branches for `dev`, `staging`, and `prod` are planned, but only once there is
real infrastructure to deploy to. Until then they would be decoration.

## Issues

Every feature, fix, and stage starts as a GitHub issue, written with the feature or bug
template, before a branch exists. The issue records what is being built, why now, the
decisions to make first, and what done looks like. Small `docs/` and `chore/` changes may
skip the issue; everything else links one.

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
- The body is not optional. Each bullet states one change and, where it is not obvious,
  why it matters. A reader of `git log` should understand the commit without opening the
  diff.
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

## Pull requests

- The title uses the same conventional format as a commit subject, for example
  `feat: run the API and frontend in compose`.
- The description follows the template in full: the linked issue (`Closes #n`), the type
  of change, what changed, why, security considerations, risk and rollback, how it was
  verified, and screenshots for any frontend change.
- **The description is permanent history.** `main` accepts merge commits only, and the
  merge commit takes the pull request's title and description as its message, so the
  write-up ends up in `git log` itself. Write it to be read years later, and never paste a
  token, cookie, or password into it.
- Merge commits are the only merge method because they keep every commit, and its hash,
  on `main`. Squash and rebase merges rewrite those hashes, which would break every
  reference to a commit in `docs/`.

## Security changes

Anything touching authentication, authorization, session handling, or input validation
needs the threat it addresses written down in `docs/learning-log.md`, together with how
the change was verified. A security control without a recorded reason tends to get
refactored away later by someone who does not know why it exists.
