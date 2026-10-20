## What changed

<!-- One or two sentences on the change and its effect, not the implementation approach. -->

## Why

<!-- The problem this solves, or the learning objective of this stage. -->

## Security considerations

<!-- Threat addressed, control added, and what the control does not cover.
     Write "none" only if the change genuinely touches no trust boundary. -->

## How it was verified

<!-- Commands run, curl cases with expected status codes, browser checks. -->

- [ ] `gofmt -l .`, `go vet ./...`, `go build ./...` are clean
- [ ] `npm run lint` and `npm run build` are clean, if the frontend changed
- [ ] No secret, `.env`, or build artifact in the diff
- [ ] `docs/PROJECT-STATE.md` and `docs/learning-log.md` match reality
- [ ] One concern only
