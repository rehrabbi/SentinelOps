# Security Policy

SentinelOps is a learning and portfolio project. It is not deployed anywhere public and
holds no real user data. Even so, security is the point of the project, so reports are
genuinely welcome.

## Supported versions

Only the current `main` branch is maintained. There are no releases or back ported fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead, through the Security tab of this repository, under
"Report a vulnerability". If that is unavailable, open a normal issue that says only that
you have found a security issue and asks for a private channel, with no details in it.

Useful reports include the affected endpoint or file, what an attacker can achieve, and
the steps to reproduce. A working proof of concept is helpful but not required.

Expect a first reply within about a week. Since this is a personal project rather than a
product, there is no formal disclosure timeline and no bug bounty.

## Scope

In scope is everything in this repository, meaning the Go API, the React client, the SQL
schema, the Docker Compose setup, and the GitHub Actions workflow.

Out of scope are findings that depend on the sample configuration being used as is, for
example the fact that `SECURE_COOKIES` defaults to `false` for local HTTP development, or
that `.env.example` ships an obvious placeholder password. Known gaps already listed in
the README do not need a report, though a report showing one is worse than documented is
very welcome.

## Known gaps

The README has a "Known gaps" section listing the issues already identified and not yet
fixed, including the unauthenticated `GET /api/users` endpoint, the registration
enumeration difference, and the absence of rate limiting.
