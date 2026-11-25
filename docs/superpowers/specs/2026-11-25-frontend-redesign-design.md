# SentinelOps frontend redesign and brand: design

**Date:** 2026-11-25 · **Status:** draft, reviewed by a builder check; awaiting the owner's approval · **Target release:** v1.1.0

## Intent

SentinelOps is a live, invite-only incident and ticket tracker (React 19 + Vite frontend on
Cloudflare Pages, Go API on Render, Postgres on Neon). Its interface is still the plain one it was
built with. The owner wants a complete overhaul with its own brand: logo, favicon and the small
details, plus motion and creativity, connected to what the application is for.

What someone should feel on opening it, in the owner's words: that it is **a secured, legitimate
application, genuine and real**, with a **vigilant edge: a watchtower at night, alert, sharp, a little
dramatic, security-forward, a sense that something is always scanning**.

## Goals

- A distinctive, original identity for SentinelOps: name treatment, logo, favicon set, colour, type,
  voice, and a short brand guide.
- Every existing screen redesigned, plus three new pieces: a public landing page, an incident overview
  with charts, and a brand kit with social assets.
- Bold, showy motion that still serves the work (see "Motion" below).
- Trust first: the drama lives in the landing page, the sign-in moment, the logo and transitions; the
  screens where people work stay steady and fast to read.

## Non-goals

- No change to the API, the database, authentication rules or authorization. The redesign uses only
  the endpoints that exist today (see "Data the charts can use").
- No new product features beyond the landing page and the overview (no notifications, search,
  comments or the like).
- No marketing claims that are not true. See "Honesty" below.

## Anti-goals (the owner would wince at these)

- **Looks templated or AI-made:** generic gradients, stock card grids, the starter-dashboard look.
- **Hacker clichés:** Matrix rain, skulls, glitch text, fake terminal typing.
- **Hard to read:** low contrast, tiny text, motion that gets in the way of work.
- **Slow or janky:** stuttering animation, layout jumps, a heavy page.

## Decisions made by the owner

| Topic | Decision |
|---|---|
| Visual direction | **Deep night + signal:** a dark ink-blue base with one bright signal colour, and a crisp light counterpart |
| Signal colour | **Ice blue.** Severity keeps its own colours (critical red, high orange, medium amber, low neutral or green), so the signal never means danger |
| Logo | **An abstract watchful eye:** geometric, part eye, part shield, part radar sweep; it animates (a scan or blink) and still reads at 16 px |
| Motion | **Bold and showy** (balanced by the anti-goals above and by "reduce motion") |
| Theme | **Follow the system** (dark or light from the device), with a toggle to override that is remembered on the device |
| Typography | **Sharp grotesk + mono:** Space Grotesk for headings and interface, JetBrains Mono for IDs, timestamps, counts and data |
| Packages | **Allowed:** `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` (OFL, self-hosted fonts) and `motion` (MIT, the Motion animation library). Nothing else without asking |
| Landing page | **A product page, as for a real SaaS:** what SentinelOps does, how it protects data, its security story, with sign-in at hand |
| Scope | **Every existing screen, a public landing page, an incident overview with charts, and a brand kit with social assets** |
| Who builds it | **Claude writes it and explains it.** The owner explicitly asked for this for this stage (CLAUDE.md allows it per task), so the usual "owner types the code" rule does not apply here |
| Rollout | **A `redesign` branch, one launch.** Each step is a reviewed pull request into `redesign`, checked locally in a browser; the live site keeps today's look until one final pull request merges `redesign` into `main` at v1.1.0. Every merge to `main` deploys to production, so nothing half-finished goes public |
| Development tools | **Allowed, development only (nothing ships to the site):** `vitest`, `@testing-library/react`, `@testing-library/user-event` and `jsdom` (MIT) for frontend tests that run in CI, and `@resvg/resvg-js` (MPL-2.0) to render the PNG icons and social images from the SVG sources by a repeatable script |
| Who runs it | **Product page with an honest credit:** a plain footer line saying it is built and operated by the owner as an open-source project, linking to the GitHub repository. "Have an invite?" explains that invites come from an administrator |
| Privacy | **A short, true privacy notice** (see below); no terms of service |

## Sign-off points

The owner approves these before they are built on (Claude's call on where to stop):
1. **The logo:** picked from the explorations, before it goes into anything else.
2. **The brand board:** palette in both themes, type, the eye's motion, before screens are built with it.
3. **The first fully redesigned screen** (the sign-in), before the rest follow its pattern.

Everything else goes through pull requests into `redesign` as usual, and the launch pull request into
`main` gets the owner's look before it merges.

## Screens and pieces in scope

1. **Landing page** (public, signed out): hero with the animated eye, what SentinelOps does (report,
   triage, resolve incidents), how it protects data (only facts true of this deployment: invite-only
   accounts, hashed sessions in HttpOnly cookies, role-based access, a hash-chained audit log anchored
   every 6 hours, rate limiting, encrypted backups in two places, a weekly security scan), a call to sign
   in, and a footer with the credit line, the GitHub repository and release links, and the privacy
   notice.
2. **Sign in.** The dramatic moment: the eye "wakes", a scan passes, the form settles in. Clear errors
   (wrong credentials, too many attempts with the wait).
3. **Accept invite** (`/invite#<token>`) and **reset password** (`/reset#<token>`): same family as sign in.
   Their paths and the `#token` behaviour must not change, because links already issued use them.
4. **Incident dashboard:** the overview (see below), then the list with severity and status as clear
   badges, inline status changes, and the create form.
5. **Users (admin):** roles, invites and reset links; the one-time link display stays prominent and safe.
6. **Account security:** change password, log out everywhere.
7. **App states:** loading, empty lists, errors, the not-found redirect, and a session that expired
   mid-use.
8. **Privacy notice** (public): what is stored and why: the account's email address, name and bcrypt
   password hash; incidents; session token hashes (7 days); audit entries with IP addresses (kept, as a
   tamper-evident record); one log line per request at the API host (no cookies, headers or bodies);
   encrypted backups kept 90 days (GitHub and Backblaze). Where it is hosted: Cloudflare (site and
   proxy), Render (API), Neon (database), GitHub and Backblaze (backups). One cookie, the session; no
   analytics and no trackers. Only true statements; the builder checks each against the code and docs.
9. **Brand kit:** logo files (mark, wordmark, lockup; dark and light), favicon set (SVG, a PNG fallback,
   an Apple touch icon, the icons a web manifest needs), `site.webmanifest`, theme-color, a link-preview
   (Open Graph) image of 1200×630, a GitHub social card, a one-page brand guide in `docs/`, and new
   README screenshots.

## The incident overview

Counts and small charts above the list. They're computed in the browser from `GET /api/incidents`,
which returns only what the caller may see (reporters their own, analysts and admins all):
- open incidents by severity;
- incidents by status;
- incidents created per day over the last 30 days.

They should read at a glance and animate on load and on change. With little data (a fresh deployment
has a handful of incidents), they must still look intentional, not empty.

**Data the charts can use** (the `Incident` type): `id`, `userId`, `title`, `description`, `status`
(open, investigating, resolved, closed), `severity` (low, medium, high, critical), `createdAt`,
`updatedAt`. There is no history of status changes, so "time to resolve" cannot be computed exactly.

## Motion

Bold and showy, inside these rules:
- **Purpose:** each animation explains something: where content came from, what changed, what needs
  attention, that the system is watching.
- **Where it is loud:** the landing page, the sign-in moment, the logo, page transitions, the overview's
  numbers and charts.
- **Where it is quiet:** lists, forms and tables people work in. Feedback there is quick and never
  delays input.
- **Signature motif:** a scan or sweep (the eye's radar) used sparingly as the brand's motion idea, not
  as decoration everywhere.
- **Performance:** only transform and opacity animate where possible. No layout jumps; 60 fps on an
  ordinary laptop.
- **Reduce motion:** with `prefers-reduced-motion: reduce`, motion becomes simple fades or none; nothing
  important depends on animation.

## Hard constraints

- **Security headers stay as they are** (`frontend/public/_headers` in production,
  `frontend/nginx.conf.template` in the container):
  `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self';
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, plus cross-origin isolation
  (`Cross-Origin-Embedder-Policy: require-corp`, COOP and CORP `same-origin`) and a `Permissions-Policy`.
  This means:
  - fonts, images and every asset are served from the site itself, with no CDNs and no Google Fonts;
  - no inline `<style>` or `<script>` tags. Setting styles from JavaScript (as Motion and React do)
    is fine;
  - SVG assets have no scripts.
- **Free:** no paid services, and no assets that need a licence.
- **Accessibility:** WCAG 2.1 AA: contrast in both themes, visible focus, full keyboard use, sensible
  screen-reader labels, and the reduce-motion behaviour above.
- **Phones:** every screen works at 375 px with no sideways scrolling.
- **Behaviour:** login, invites, resets, roles, incident create and update, account security and log
  out work exactly as today.
- **Packages:** only those listed under "Decisions". Pin exact versions that are at least two weeks
  old. `motion` 14.14.0 is newer than that, so use the newest release from before 2026-11-11.
- **Tests:** frontend tests run in CI as a required check, covering at least the chart data logic and
  the sign-in, invite and reset flows.
- **Delivery:** small pull requests with the project's usual checks (build, lint, `npm audit`, CodeQL,
  the ZAP baseline after deploy). No AI attribution anywhere.

## Honesty

The landing page presents SentinelOps as a real product, so it must be true:
- no invented customers, testimonials, logos of other companies, certifications or statistics;
- it says who runs it (the credit line above);
- every security claim must be something this deployment actually does;
- accounts are by invitation only, so there is no "sign up" or "start free trial". The calls to action
  are "Sign in" and "Have an invite?" (which explains how invites work).

## How it gets built (skills)

These skills guide the work, each for its part:
- **Direction and brand:** brainstorming (this document), brand, design-taste-frontend, frontend-design,
  ui-ux-pro-max.
- **System and redesign:** design-system (tokens and component specs), impeccable (the redesign workflow
  and final audit).
- **Assets:** canvas-design (logo explorations and brand board), banner-design (link preview and social
  card), algorithmic-art (optionally, a subtle generative backdrop motif).
- **Motion:** emil-design-eng, design-motion-principles (build, then audit).
- **Quality:** frontend-ui-engineering, design:ux-copy, human-writing, design:accessibility-review,
  design:design-critique, performance-optimization, security-and-hardening, dataviz (the charts).
- **Verification:** browser-testing-with-devtools, webapp-testing, test-driven-development,
  verification-before-completion, code-review-and-quality, documentation-and-adrs.

## Left to the builder

- The exact palette values, type scale, spacing, radii and token names, within the decisions above.
- Component structure, file layout and CSS organisation (the project uses plain CSS today).
- Routing details, as long as `/invite` and `/reset` keep their paths and `#token` handling, and
  signed-out visitors land on the landing page.
- The chart implementation, using no new package beyond those allowed.
- How raster icons and social images are produced from the SVG sources.
- The order of the steps, each a pull request into `redesign`, ending with the launch pull request into
  `main` and a release as v1.1.0.

## Calls made by Claude (for the owner to check)

- The three sign-off points above.
- The credit line names the owner by their GitHub handle, **rehrabbi**, which is already public in the
  repository's address, rather than their full name. The owner can choose otherwise.
- Severity keeps its own colour scale, separate from the ice-blue signal.
- The privacy notice has no terms of service beside it.
