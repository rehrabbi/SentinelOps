# SentinelOps Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SentinelOps its own brand (logo, favicon set, social assets, brand guide) and redesign
every screen, plus a public landing page, a privacy notice and an incident overview with charts, with
bold purposeful motion, released as v1.1.0.

**Architecture:** Plain CSS built on three layers of custom properties (primitive, semantic,
component) with dark and light themes; small focused React components; Motion for orchestrated
animation; charts drawn as hand-built SVG from pure, tested data functions. Work lands as pull requests
into a `redesign` branch and launches with one pull request into `main`.

**Tech Stack:** React 19, Vite, TypeScript, react-router 8, plain CSS; `motion`,
`@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`; Vitest, Testing Library, jsdom;
`@resvg/resvg-js` for raster assets.

**Spec:** `docs/superpowers/specs/2026-11-25-frontend-redesign-design.md`

## Global Constraints

- Security headers unchanged: `default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, COEP `require-corp`, COOP and CORP `same-origin`, the existing `Permissions-Policy`.
- Every asset served from the site itself: no CDNs, no Google Fonts; no inline `<style>`/`<script>`; SVGs contain no scripts.
- Runtime packages: only `motion`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`. Dev-only: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@resvg/resvg-js`. Nothing else.
- Exact pinned versions, each released at least two weeks before install; for `motion`, the newest release before 2026-11-11.
- Free only; no licensed assets.
- WCAG 2.1 AA in both themes; visible focus; full keyboard use; `prefers-reduced-motion: reduce` turns motion into simple fades or none.
- Every screen works at 375 px wide with no sideways scrolling.
- Behaviour unchanged: login, invites (`/invite#<token>`), resets (`/reset#<token>`), roles, incidents, account security, logout.
- Signal colour ice blue; severity keeps its own scale (critical red, high orange, medium amber, low neutral or green).
- Type: Space Grotesk (headings, interface), JetBrains Mono (IDs, timestamps, counts, data).
- Theme follows the system, with a toggle that overrides it, remembered on the device.
- Landing copy: true claims only; no customers, testimonials, certifications or statistics; no sign-up; calls to action "Sign in" and "Have an invite?"; footer credit to the owner as `rehrabbi`.
- Pull requests target `redesign`; the launch pull request targets `main`. No AI attribution in commits, pull requests or files.
- Owner sign-off before building on: (1) the logo, (2) the brand board, (3) the redesigned sign-in.

## Review Focus

- **A session that expires while someone works:** the next API call answers 401. Expect a clear "your session ended" message on the sign-in screen, not a blank page or a raw error (Task 8).
- **"Reduce motion" turned on:** every piece of content must be visible and usable without waiting for an animation; nothing starts hidden and depends on an animation to appear (Tasks 3 and 9).
- **Overview with zero, one, or only closed incidents:** charts show a designed empty or near-empty state, never `NaN`, division by zero, or an empty box (Task 12).
- **Long values at 375 px:** a 200-character incident title or a long email address wraps or truncates with the full text available, never overflowing the screen (Tasks 6 and 13).
- **Theme storage unavailable** (private window, blocked storage): the theme still follows the system and the toggle still works for the visit, with no crash (Task 2).

---

### Task 0: The redesign branch and its checks

**Files:**
- Modify: `.github/workflows/ci.yml` and `.github/workflows/security.yml` (`pull_request` triggers include `redesign`)

- [ ] **Step 1:** Create the `redesign` branch from `main`; push it.
- [ ] **Step 2:** Make CI and Security run on pull requests into `redesign` (they already run for `main`).
- [ ] **Step 3:** Verify with the first task's pull request into `redesign`: every check runs and passes.
- [ ] **Step 4:** Commit `ci: run checks on pull requests into the redesign branch`.

### Task 1: Test tooling and CI

**Files:**
- Modify: `frontend/package.json` (scripts `test`, `test:watch`; dev dependencies)
- Modify: `frontend/vite.config.ts` (Vitest `test` block: `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`)
- Create: `frontend/src/test/setup.ts` (Testing Library cleanup; `matchMedia` stub controllable per test)
- Create: `frontend/src/test/smoke.test.ts`
- Modify: `.github/workflows/ci.yml` (frontend job: `npm test` after lint)

**Interfaces:**
- Produces: `npm test` (runs once, exits non-zero on failure); `setMatchMedia(query: string, matches: boolean): void` exported from `src/test/setup.ts` for later tests.

- [ ] **Step 1:** Install the dev packages at exact versions meeting the two-week rule (`npm install -D --save-exact …`); confirm `npm audit --omit=dev` is unchanged.
- [ ] **Step 2:** Write `smoke.test.ts`: `expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false)`, then after `setMatchMedia('(prefers-reduced-motion: reduce)', true)` it is `true`.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (no setup yet).
- [ ] **Step 4:** Implement the Vitest config and `setup.ts`.
- [ ] **Step 5:** Run `npm test`, `npm run lint`, `npm run build`. Expected: all pass.
- [ ] **Step 6:** Commit `test: add frontend test tooling and run it in CI`.

### Task 2: Fonts, design tokens and theme

**Files:**
- Create: `frontend/src/styles/tokens.css` (primitive, semantic and component custom properties; `:root[data-theme="dark"]` and `[data-theme="light"]`)
- Create: `frontend/src/styles/base.css` (reset, typography, focus ring, reduced-motion rules); replaces `index.css`
- Create: `frontend/src/theme/theme.ts`, `frontend/src/theme/ThemeToggle.tsx`
- Test: `frontend/src/theme/theme.test.ts`
- Modify: `frontend/src/main.tsx` (import fonts, styles; apply theme before first render)

**Interfaces:**
- Produces: `type ThemeChoice = 'system' | 'dark' | 'light'`; `readChoice(): ThemeChoice` (storage key `sentinelops.theme`; `'system'` when missing, invalid, or storage throws); `saveChoice(c: ThemeChoice): void` (never throws); `resolveTheme(c: ThemeChoice, systemDark: boolean): 'dark' | 'light'`; `applyTheme(t: 'dark' | 'light'): void` (sets `document.documentElement.dataset.theme`); `useTheme(): { choice: ThemeChoice; theme: 'dark' | 'light'; setChoice(c: ThemeChoice): void }`, which follows live system changes while `choice === 'system'`.
- Semantic token names later tasks use: `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-signal`, `--color-signal-strong`, `--color-danger`, `--color-sev-critical|high|medium|low`, `--color-status-open|investigating|resolved|closed`, `--font-sans`, `--font-mono`, `--space-1..8`, `--radius-sm|md|lg`, `--ease-out`, `--ease-in-out`, `--dur-fast|base|slow`.

- [ ] **Step 1:** Write tests: `resolveTheme('system', true) === 'dark'`; `resolveTheme('light', true) === 'light'`; `readChoice()` returns `'system'` when `localStorage.getItem` throws and when it returns `'purple'`; `saveChoice('dark')` then `readChoice() === 'dark'`; `saveChoice` does not throw when `setItem` throws.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `theme.ts` and `ThemeToggle` (a three-way control: system, dark, light, with an accessible name and the current choice announced).
- [ ] **Step 4:** Write `tokens.css` from the brand board (Task 5). Until then use placeholder values with the final names; text contrast ≥ 4.5:1 and UI contrast ≥ 3:1 in both themes.
- [ ] **Step 5:** Run `npm test`, `npm run build`. Expected: pass.
- [ ] **Step 6:** Commit `feat: add design tokens, fonts and a system-following theme`.

### Task 3: Motion foundations

**Files:**
- Create: `frontend/src/motion/presets.ts`, `frontend/src/motion/useReducedMotion.ts`
- Test: `frontend/src/motion/presets.test.ts`

**Interfaces:**
- Consumes: `setMatchMedia` (Task 1).
- Produces: `useReducedMotion(): boolean` (tracks `prefers-reduced-motion: reduce` live); `transition(kind: 'enter' | 'exit' | 'emphasis' | 'page', reduced: boolean)`, returning a Motion `Transition`; `variants(kind: 'fadeUp' | 'scan' | 'stagger', reduced: boolean)`, returning Motion `Variants` where every `initial` state with `reduced === true` has `opacity: 1` and no transform offset (content is visible without the animation running).

- [ ] **Step 1:** Write tests: for each kind, `variants(kind, true).initial` has `opacity` 1 (or no `opacity`) and no `x`/`y`/`scale` other than identity; `transition('page', true).duration <= 0.15`; `useReducedMotion()` returns `true` after `setMatchMedia('(prefers-reduced-motion: reduce)', true)`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Install `motion` (pinned per Global Constraints) and implement. Durations and easing follow emil-design-eng and design-motion-principles: enter faster than 300 ms for working screens, the signature `scan` reserved for the logo and hero.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add motion presets that respect reduced motion`.

### Task 4: Logo exploration (sign-off 1)

**Files:**
- Create: `docs/brand/explorations/` (three to five candidate marks as SVG, plus one PNG contact sheet)

- [ ] **Step 1:** Using canvas-design and brand, draw three to five candidates for the abstract watchful eye (eye, shield and radar sweep), each tested at 16, 32 and 180 px on dark and light backgrounds.
- [ ] **Step 2:** Show the contact sheet to the owner. **Stop until the owner picks one** (or asks for another round).
- [ ] **Step 3:** Commit `docs: logo explorations` with the chosen mark recorded in the commit body.

### Task 5: Brand board, logo system and icons (sign-off 2)

**Files:**
- Create: `frontend/src/brand/Logo.tsx` (inline SVG React component)
- Create: `frontend/public/favicon.svg` (replaces the default), `frontend/public/mask-icon.svg`, `frontend/public/site.webmanifest`
- Create: `frontend/scripts/render-icons.mjs`; `npm run icons` writes `public/favicon-32.png`, `public/apple-touch-icon.png` (180), `public/icon-192.png`, `public/icon-512.png`, `public/og-image.png` (1200×630), `docs/images/social-card.png` (1280×640)
- Create: `frontend/src/brand/brand-assets.test.ts`
- Create: `docs/brand/logo-mark.svg`, `logo-wordmark.svg`, `logo-lockup.svg`, each with a `-light` variant (standalone logo files)
- Create: `docs/brand.md` (brand guide: personality, voice, palette with contrast ratios, type, logo use, motion principles)
- Modify: `frontend/index.html` (title "SentinelOps", description, `theme-color` for both schemes, icons, manifest, Open Graph and Twitter meta with absolute URLs on https://sentinelops.pages.dev)
- Delete: `frontend/public/icons.svg` if unused

**Interfaces:**
- Produces: `<Logo variant="mark" | "wordmark" | "lockup" size?: number animated?: boolean title?: string />`. With `animated` it plays the eye's wake-and-scan once on mount (and not under reduced motion); without `title` it is `aria-hidden`.

- [ ] **Step 1:** Build the brand board (palette in both themes, type specimen, logo lockups, the eye in motion) as a local page or PNG. Show it to the owner. **Stop until approved.**
- [ ] **Step 2:** Write tests: `Logo` renders an `svg` with `role="img"` and the given title when `title` is set, and `aria-hidden="true"` otherwise; after `npm run icons`, each PNG exists with exactly the dimensions listed above (read the PNG header); `site.webmanifest` parses and lists the 192 and 512 icons; `favicon.svg` contains no `<script` and no `on…=` attributes.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL.
- [ ] **Step 4:** Implement the component, SVGs, manifest, script and HTML; set the final token values in `tokens.css`; write `docs/brand.md` (human-writing for its prose).
- [ ] **Step 5:** Run `npm run icons`, `npm test`, `npm run build`. Expected: pass; the built `index.html` references only same-origin assets.
- [ ] **Step 6:** Commit `feat: add the SentinelOps logo, icons and brand guide`.
- [ ] **Step 7:** The GitHub social card is a repository setting: give `docs/images/social-card.png` to the owner to upload (Settings → Social preview).

### Task 6: Component kit and app shell

**Files:**
- Create: `frontend/src/ui/Button.tsx`, `Field.tsx`, `Badge.tsx`, `Card.tsx`, `EmptyState.tsx`, `Toast.tsx`, `Spinner.tsx`, and one CSS file each under `frontend/src/ui/`
- Create: `frontend/src/layout/AppShell.tsx`, `frontend/src/layout/PublicShell.tsx`
- Test: `frontend/src/ui/Badge.test.tsx`, `frontend/src/ui/Field.test.tsx`

**Interfaces:**
- Consumes: tokens (Task 2), presets (Task 3), `Logo` (Task 5), `ThemeToggle` (Task 2).
- Produces: `Button` (`variant: 'primary' | 'secondary' | 'ghost' | 'danger'`, `busy?: boolean` sets `aria-busy` and disables), `Field` (label, hint, error wired by `aria-describedby`), `SeverityBadge({ severity })` and `StatusBadge({ status })` (text always visible; colour never the only signal), `Card`, `EmptyState({ title, body, action? })`, `toast(message, kind)`, `AppShell` (header with logo, nav: Incidents, Users for admins, Account; user menu with Log out; `ThemeToggle`; skip-to-content link), `PublicShell` (landing, sign-in and legal pages).

- [ ] **Step 1:** Write tests: `SeverityBadge` renders the text "critical" with class `sev-critical`, the same for each level; `Field` with `error="Too short"` gives the input `aria-invalid="true"` and an `aria-describedby` pointing at the error text; a 200-character title inside `Card` keeps `overflow-wrap: anywhere` (assert the class that applies it).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement, using impeccable and design-taste-frontend for the look, frontend-ui-engineering for structure, and ux-copy for labels.
- [ ] **Step 4:** Run `npm test`, `npm run build`. Expected: pass.
- [ ] **Step 5:** Commit `feat: add the component kit and app shells`.

### Task 7: Routing

**Files:**
- Modify: `frontend/src/App.tsx` (routes only; screens move to `frontend/src/pages/`)
- Test: `frontend/src/App.routes.test.tsx`

**Interfaces:**
- Produces routes: `/` → landing when signed out, incidents when signed in; `/signin`; `/invite` and `/reset` (paths and `#token` handling unchanged); `/privacy` (public); `/admin` (admins only, otherwise `/`); `/account` (signed in, otherwise `/signin`); anything else → `/`.

- [ ] **Step 1:** Write tests (mock `getMe`): signed out, `/` shows the landing heading; signed in, `/` shows the incidents heading; signed out, `/account` lands on `/signin`; a reporter at `/admin` lands on `/`; `/invite#abc` reads token `abc` and clears the hash.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: route signed-out visitors to the landing page`.

### Task 8: Sign in, and an expired session (sign-off 3)

**Files:**
- Create: `frontend/src/pages/SignIn.tsx` (+ CSS)
- Modify: `frontend/src/api.ts` (`onSessionExpired(handler: () => void): void`; `request` calls it on a 401 from any call except `GET /api/me` and `POST /api/sessions`)
- Test: `frontend/src/pages/SignIn.test.tsx`, `frontend/src/api.test.ts`

- [ ] **Step 1:** Write tests: a wrong password shows "Invalid email or password"; a 429 with `Retry-After: 120` shows "Too many failed attempts. Try again in 2 minutes."; a successful sign-in calls `onLoggedIn` with the user; `onSessionExpired`'s handler runs on a 401 from `getIncidents` and not on a 401 from `login`; after expiry the sign-in screen shows "Your session ended. Sign in again."
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the dramatic sign-in (the eye wakes, a scan passes, the form settles; reduced motion: a plain fade) and the expiry handling.
- [ ] **Step 4:** Run `npm test`; check it in a browser on the local stack in both themes and at 375 px. Show the owner. **Stop until approved.**
- [ ] **Step 5:** Commit `feat: redesign sign-in and handle an expired session`.

### Task 9: Accept invite and reset password

**Files:**
- Create: `frontend/src/pages/AcceptInvite.tsx`, `frontend/src/pages/ResetPassword.tsx` (moved from `App.tsx` and `account.tsx`)
- Test: `frontend/src/pages/AcceptInvite.test.tsx`, `frontend/src/pages/ResetPassword.test.tsx`

- [ ] **Step 1:** Write tests: without a token each shows its "needs the full link" message; mismatched passwords show "The passwords do not match" and send nothing; a successful reset shows the "logged out everywhere" confirmation; under reduced motion the form is visible on first render.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement in the sign-in's visual family.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: redesign the invite and reset pages`.

### Task 10: Landing page

**Files:**
- Create: `frontend/src/pages/Landing.tsx` (+ CSS), sections as components under `frontend/src/pages/landing/`
- Test: `frontend/src/pages/Landing.test.tsx`

- [ ] **Step 1:** Write tests: the page has exactly one `h1`; it has links "Sign in" (to `/signin`) and "Have an invite?" (opens an explanation that invites come from an administrator); the footer contains "rehrabbi", a link to `https://github.com/rehrabbi/SentinelOps` and a link to `/privacy`; the text contains none of "sign up", "free trial", "customers", "trusted by" (case-insensitive).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement: hero with the animated eye, what it does, how it protects data (only the claims listed in the spec), sign-in call, footer. Optional generative backdrop (algorithmic-art), rendered as static SVG or CSS within the CSP. Copy via ux-copy and human-writing.
- [ ] **Step 4:** Run `npm test`; browser check at 375, 768 and 1440 px in both themes; Lighthouse performance ≥ 90 on the built site locally.
- [ ] **Step 5:** Commit `feat: add the public landing page`.

### Task 11: Privacy notice

**Files:**
- Create: `frontend/src/pages/Privacy.tsx`
- Test: `frontend/src/pages/Privacy.test.tsx`

- [ ] **Step 1:** Write a test: the page names each stored item from the spec (email, name, password hash, incidents, session hashes "7 days", audit entries with IP addresses, request logs, backups "90 days") and each host (Cloudflare, Render, Neon, GitHub, Backblaze), and says there are no analytics.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement; check every statement against `docs/RUNBOOK.md`, `README.md` and the code before writing it.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add a privacy notice`.

### Task 12: Incident overview with charts

**Files:**
- Create: `frontend/src/overview/stats.ts`, `frontend/src/overview/Overview.tsx`, `frontend/src/overview/charts/*.tsx`
- Test: `frontend/src/overview/stats.test.ts`, `frontend/src/overview/Overview.test.tsx`

**Interfaces:**
- Consumes: `Incident` (`api.ts`), badges and tokens.
- Produces: `countBy<K>(items: Incident[], key: 'status' | 'severity'): Record<K, number>` (every level present, zeros included); `openBySeverity(items: Incident[]): Record<IncidentSeverity, number>` (status `open` or `investigating`); `perDay(items: Incident[], days: number, now: Date): { date: string; count: number }[]` (exactly `days` entries, oldest first, UTC `YYYY-MM-DD`, days without incidents as 0).

- [ ] **Step 1:** Write tests: `countBy([], 'status')` gives `{ open: 0, investigating: 0, resolved: 0, closed: 0 }`; `openBySeverity` ignores resolved and closed; `perDay(items, 30, now)` has length 30, the last date is `now`'s UTC date, and an incident from 31 days ago is excluded; `Overview` with no incidents shows its empty state and no `NaN` anywhere in the rendered text; with only closed incidents, "0 open" is shown.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the functions, then the charts as accessible SVG (each with a text summary for screen readers) following dataviz; numbers count up and bars grow on load (reduced motion: shown final).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add the incident overview`.

### Task 13: Incident list and create form

**Files:**
- Create: `frontend/src/pages/Incidents.tsx` (replaces `incidents.tsx`)
- Test: `frontend/src/pages/Incidents.test.tsx`

- [ ] **Step 1:** Write tests: creating an incident adds it at the top with status "open" and the overview counts update; changing a status calls `updateIncident` and shows the new badge; a failed update restores the previous status and shows the server's message; a 200-character title renders within the row.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement with quiet, fast list motion (new items slide in, removed ones collapse; no delay on input).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: redesign the incident list`.

### Task 14: Users and Account security

**Files:**
- Create: `frontend/src/pages/Users.tsx`, `frontend/src/pages/Account.tsx` (replace `admin.tsx`, `account.tsx`)
- Test: `frontend/src/pages/Users.test.tsx`, `frontend/src/pages/Account.test.tsx`

- [ ] **Step 1:** Write tests: the admin's own row has no role select enabled and no "Reset password"; issuing a reset shows the one-time link once with a Copy button; a refused role change restores the previous role; on Account, a wrong current password shows "current password is incorrect" and keeps the user signed in; "Log out everywhere" returns to the landing page.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: redesign the users and account screens`.

### Task 15: Audits, polish and documentation

**Files:**
- Modify: as findings require
- Create: `docs/adr/0001-frontend-design-system.md`
- Modify: `README.md` (screenshots, brand, the frontend's tests), `CHANGELOG.md`, `docs/PROJECT-STATE.md`, `docs/images/*.png` (new screenshots)

- [ ] **Step 1:** Run the audits on the local stack: design:accessibility-review (both themes, keyboard only, screen-reader labels, reduced motion), design-motion-principles audit, impeccable audit, design:design-critique, performance-optimization (built bundle size before/after, Lighthouse ≥ 90 on landing and sign-in), and browser-testing-with-devtools for console errors and CSP violations on every screen. Fix every finding of Medium or above, or record why not.
- [ ] **Step 2:** Run `npm test`, `npm run lint`, `npm run build`, `npm audit --omit=dev`. Expected: all pass, with no new advisories.
- [ ] **Step 3:** Take screenshots of every screen (webapp-testing or the browser tools) for the README; write the ADR and docs (human-writing).
- [ ] **Step 4:** Commit `docs: record the design system and new screenshots`.

### Task 16: Launch

**Files:**
- None new (a pull request from `redesign` into `main`)

- [ ] **Step 1:** Open the launch pull request into `main`; the owner looks before it merges.
- [ ] **Step 2:** After it merges, confirm Deploy frontend passes its post-deploy health check, run **ZAP baseline** by hand (it must pass), and check every screen live in both themes.
- [ ] **Step 3:** Release prep pull request (CHANGELOG `[1.1.0]`, README status, project state, learning-log entry). Tag `v1.1.0` and publish only after the owner says so.
