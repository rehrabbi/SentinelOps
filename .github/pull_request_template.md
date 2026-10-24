<!-- This description becomes the merge commit message on main, comments included.
     Fill every section, then delete these guidance comments before opening. -->

Closes #

<!-- The issue this resolves. Small docs/ or chore/ changes without an issue:
     write "No linked issue" and say why. -->

## Type of change

- [ ] Feature (`feat`)
- [ ] Fix (`fix`)
- [ ] Documentation (`docs`)
- [ ] Build or dependencies (`build`)
- [ ] CI (`ci`)
- [ ] Refactor, no behaviour change (`refactor`)
- [ ] Housekeeping (`chore`)

## What changed

<!-- One or two sentences on the change and its effect, then bullets if there are several
     parts. Not the implementation approach. -->

## Why

<!-- The problem this solves, or the learning objective of this stage. -->

## Security considerations

<!-- Threat addressed, control added, and what the control does not cover.
     Write "none" only if the change genuinely touches no trust boundary. -->

## Risk and rollback

<!-- What could break, who or what it affects, and how to undo it
     (for example: revert the merge commit; migration 000006 has a down file). -->

## How it was verified

<!-- Commands run, curl cases with expected status codes, browser checks. -->

- [ ] `gofmt -l .`, `go vet ./...`, `go build ./...` are clean
- [ ] `npm run lint` and `npm run build` are clean, if the frontend changed
- [ ] No secret, `.env`, or build artifact in the diff
- [ ] `docs/PROJECT-STATE.md` and `docs/learning-log.md` match reality
- [ ] `CHANGELOG.md` updated under `Unreleased`, if the change is user-visible or security-relevant
- [ ] One concern only

## Screenshots

<!-- Required for any frontend change: before and after. Otherwise write "Not applicable".
     Never capture a real session cookie, token, or password. -->
