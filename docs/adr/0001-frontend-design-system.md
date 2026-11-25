# ADR 0001: Frontend design system and brand

Status: Accepted
Date: 2026-11-25

## Context

Until v1.0.0 the interface was the plain one the app was built with: one stylesheet, no brand,
no landing page, no charts, and no tests for the frontend. It worked, but it did not look like
the secured, careful application the backend is. A visitor who was not signed in saw only a login
form, and the signed-in screens were lists with default controls.

The owner asked for a complete overhaul with its own identity: logo, colour, type, motion, and
every screen redone. The design spec is `docs/superpowers/specs/2026-11-25-frontend-redesign-design.md`
and the build plan sits beside it in `docs/superpowers/plans/`. This record keeps the decisions
that are expensive to reverse, and the reasons for them.

## Decision

**Direction.** A watchtower at night: a deep ink-blue base with one ice-blue signal colour, and a
crisp light counterpart. Severity keeps its own colour scale (critical red, high orange, medium
amber, low steel grey) so the signal blue never means danger. The values are in
`frontend/src/styles/tokens.css` and are explained in `docs/brand.md`.

**Mark.** Facet, an eye drawn only in straight lines: two chevrons for the lids, a diamond for the
pupil. The pupil is always the signal colour. The geometry lives in `frontend/src/brand/geometry.ts`,
and the logo files and icons are generated from it (`npm run icons`).

**Type.** Space Grotesk for the interface and JetBrains Mono for IDs, timestamps and counts, from
`@fontsource/space-grotesk` and `@fontsource/jetbrains-mono`. The fonts are packages bundled into
the site, because the Content Security Policy allows nothing from other origins.

**Styling.** Plain CSS, with design tokens as custom properties and one class prefix per area:
`ui-` for the shared kit, and `landing-`, `auth-`, `signin-`, `incidents-`, `overview-`, `users-`,
`account-` and `privacy-` for pages. Every stylesheet is global, so the prefixes are what keep one
screen's rules off another's. A test (`frontend/src/ui/namespaces.test.ts`) keeps `ui-` classes
inside the kit and keeps the retired legacy stylesheet out. No CSS framework, no CSS-in-JS.

**Themes.** The page follows the system setting. A System, Dark, Light toggle in the account menu
overrides it, and the choice is kept in `localStorage` under `sentinelops.theme`. `main.tsx` sets
`data-theme` before React's first render. There is no inline script, because the CSP forbids one, so
the loading frame and the page background paint in the system theme first. A visitor whose saved
choice is the opposite of their system setting can therefore see a brief flash of the system theme
before `main.tsx` applies the saved one. An OS theme change is picked up while the page is open.

**Motion.** The `motion` package (14.12.0), with presets in `frontend/src/motion/presets.ts`:
timings that mirror the CSS tokens, and named variants (`fadeUp`, `scan`, `stagger`). Loud motion is
kept for the landing page, the sign-in moment, the logo and the overview. Working screens get short
feedback only. Under `prefers-reduced-motion: reduce`, every preset becomes a 120 ms fade and
content is visible from the first frame.

**Kit.** Shared components live in `frontend/src/ui/`: `Button`, `Field`, `Badge` (severity and
status), `Card`, `EmptyState`, `Spinner` and the toast store. Pages compose these; they do not
restyle them.

**Tests.** Vitest with Testing Library and jsdom, run by `npm test` and as a CI step. When this was
written the suite was 289 tests in 32 files, covering the chart data logic, the sign-in, invite and
reset flows, focus handling, the theme and the motion presets.

## Constraints that shaped it

**Strict CSP.** Production sends `default-src 'self'`, `style-src 'self'` and `script-src 'self'`
(`frontend/public/_headers`, mirrored in `frontend/nginx.conf.template`), plus cross-origin
isolation headers. So there are no inline `<style>` or `<script>` tags, no CDN fonts, no external
images, and SVG assets carry no scripts. Setting styles from JavaScript is allowed, which is how
Motion and React work. Vite's production build links its CSS from files, including the CSS of lazy
chunks. Tokens are plain CSS for the same reason: nothing has to be injected at runtime.

**WCAG 2.1 AA, plus the 2.2 criteria named here.** The design spec set 2.1 AA as the floor; the audit
before launch also applied the 2.2 criteria listed below. It is not a claim of full 2.2 AA: the footer
links are 20 px tall, which misses the 24 px target size of 2.5.8.

- Contrast is computed from the token values and checked in both themes (tables in `docs/brand.md`).
  Control edges use `--color-border`, at 3:1 or better. Colour is never the only cue: severity has a
  four-bar meter, status has a glyph, and both carry their word.
- Focus moves to the new page's heading on every in-app navigation, and each page has its own
  title (`frontend/src/layout/useRouteFocus.ts`).
- Page transitions were cut: focus moving to the new page's heading already marks the change.
- The landing page's idle scan plays once and stops. WCAG 2.2.2 wants a way to pause motion that
  lasts more than 5 seconds, and reduced motion is not a pause control. The hero motion ends about
  4.2 seconds after load.
- Error toasts never dismiss themselves, and a newer toast pushes one out only when all three
  toasts on screen are errors. Info and success
  toasts go after 5 seconds, pausing on hover, focus or a hidden tab; they only confirm what the
  screen already shows (WCAG 2.2.1).
- The per-day chart can be shown as a table, so keyboard and touch users can read each day.

**Performance.** The signed-in screens (`Incidents`, `Users`, `Account`) load on demand, so public
pages ship less. Measured on the production build:

| | Before lazy routes | After |
|---|---|---|
| JS on public pages | 469.03 kB (149.52 kB gzip) | 428.72 kB (139.27 kB gzip) |
| CSS on public pages | 62.07 kB (10.98 kB gzip) | 42.44 kB (8.66 kB gzip) |

The Incidents chunk is 37.69 kB (12.94 kB gzip) plus 9.01 kB of CSS, and it is prefetched one second
after the sign-in or invite page opens. A route error boundary keeps the shell on screen if a chunk
fails to load.

## Alternatives considered

**A utility framework (Tailwind) or a component library.** Either would have been quicker to start.
Both bring a build dependency and an idiom to learn on top of everything else, the spec allowed no
packages beyond the fonts and Motion, and a library's default look is the starter-dashboard one the
redesign was meant to leave behind. Plain CSS with tokens takes more typing and is easy to read.

**CSS-in-JS.** Most libraries inject `<style>` elements, which `style-src 'self'` blocks unless the
policy gains `'unsafe-inline'` or nonces. Weakening the policy for styling convenience was not
acceptable.

**Google Fonts or another CDN for the typefaces.** Blocked by the same policy, and it would send
each visitor's address to a third party, which the privacy notice says never happens.

**CSS-only animation.** Enough for fades, not for the sequenced sign-in moment, the staggered
overview, and one shared reduced-motion rule. Motion is a small dependency with a permissive licence.

**One theme only.** Simpler, but the owner wanted the app to follow the device, and a night-only
interface is hard to read in daylight.

**No frontend tests.** The previous state. Rejected: the flows that matter (sign-in, invite, reset,
one-time links, focus) are the ones that break quietly when a UI is rewritten.

## Consequences

- Colours, spacing, radii, timings and stacking order come from tokens. Changing a value in
  `tokens.css` changes it everywhere, and a screen that hard-codes a colour is a bug.
- New shared components go in `frontend/src/ui/` with a `ui-` prefix and a test. A new page takes
  its own prefix.
- New motion needs a reduced-motion path, and motion that runs longer than 5 seconds needs a way to
  stop. The presets exist so that this happens by default.
- Two fonts and the motion package are now dependencies that Dependabot and `npm audit` watch.
- The CSP stays as it is. A feature that wants inline styles, remote fonts or embedded third-party
  content has to change this decision first.
- The frontend has tests that gate merges, so the README no longer lists "no automated tests" among
  its known gaps.
- Test fixtures use plain words (`first_token`, not something shaped like a real key). gitleaks
  flagged a fake token in an earlier fixture, and plain words keep the secret scan clean without
  an ignore file.
