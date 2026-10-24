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

Label every issue and pull request with one `type:` label, the same word as its branch and
commits, plus one or more `area:` labels (`backend`, `frontend`, `database`, `infra`,
`security`) and, for issues, a `priority:` label (`high`, `medium`, `low`). Close an issue
that will not be done with `duplicate`, `wontfix`, or `question` as the reason.

Each roadmap stage is a milestone, created when the stage starts, and every issue in the
stage belongs to it. A stage ends when its milestone is closed, and each closed stage is
tagged as a release.

## Code of conduct and ownership

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
[`.github/CODEOWNERS`](.github/CODEOWNERS) names the maintainer, who is requested for review
automatically; code owner review is deliberately not required, since an author cannot approve
their own pull request.

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

Both CI jobs, `Backend (Go)` and `Frontend (React, TypeScript)`, are **required checks** on
`main`: a pull request cannot merge until both pass, only results reported by GitHub
Actions count, and the branch must be up to date with `main` first. When `main` has moved,
use "Update branch" and let CI run again. Required checks are matched by job name, so
renaming a job in `ci.yml` means updating the branch protection in the same change, or
every pull request will wait for a check that no longer exists.

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
- Write each paragraph and bullet of the description as one unbroken line. GitHub wraps
  the merge commit message itself but keeps any line breaks typed into the description, so
  hand-wrapped paragraphs come out ragged in `git log`.
- Merge commits are the only merge method because they keep every commit, and its hash,
  on `main`. Squash and rebase merges rewrite those hashes, which would break every
  reference to a commit in `docs/`.

## Releases

Versions follow [Semantic Versioning](https://semver.org/). While the version is `0.y.z`,
each roadmap stage ends in a minor release (`v0.2.0`, `v0.3.0`) when its milestone closes,
and fixes between stages are patch releases (`v0.2.1`). `1.0.0` is reserved for the first
hardened production deployment on AWS.

- [`CHANGELOG.md`](CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/).
  Every pull request with a user-visible or security-relevant change adds a line under
  `Unreleased`, grouped as Added, Changed, Fixed, Removed, or Security.
- To release, move the `Unreleased` lines into a new version section dated that day, merge
  that change, then create an annotated tag `vX.Y.Z` on the resulting merge commit and a
  GitHub Release whose notes are that section.
- A published tag is never moved or reused. A mistake in a release is fixed by the next one.
- Every release is confirmed by the maintainer before it is tagged.

## Security changes

Anything touching authentication, authorization, session handling, or input validation
needs the threat it addresses written down in `docs/learning-log.md`, together with how
the change was verified. A security control without a recorded reason tends to get
refactored away later by someone who does not know why it exists.
