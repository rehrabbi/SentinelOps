# SentinelOps brand guide

This is how SentinelOps looks, moves and talks. The owner approved it on the brand board
(`docs/brand/board/index.html`, with a static copy in `board.png`). The values below are the ones in
`frontend/src/styles/tokens.css`; if the two ever disagree, the CSS is what ships, and this page needs
fixing.

## Personality and voice

SentinelOps is an incident tracker. People open it when something has gone wrong, so it should feel
like a calm colleague on night shift: awake, precise, unexcited. The logo is an eye that is always
open. The interface should earn the same trust by being plain about what it knows.

How that sounds in writing:

- Say what happened and what to do next. "That link has expired. Ask an admin for a new one." is
  better than an apology followed by a paragraph.
- Use the words people use at work: incident, severity, status, assigned, resolved. Don't invent
  names for ordinary things.
- Keep claims true. The landing page and the link previews never mention customers, numbers of
  users, uptime figures, certifications or testimonials, because there are none to mention.
- No exclamation marks in the interface. A resolved incident is good news, and a tick says so.
- Timestamps, IDs and counts are data. They go in JetBrains Mono and are never rounded into prose
  ("INC-0142, opened 14:02 UTC", not "a few minutes ago" on its own).

The one line we use where a tagline is wanted (link previews, the social card) is "Incident
tracking, watched closely."

## Logo

The mark is called Facet: an eye drawn only in straight lines. Two chevrons are the lids (the lower
one doubles as a shield point) and a diamond is the pupil. The lids take the ink colour; the pupil is
always the signal colour, the one ice-blue spot.

There are three forms:

| Form | Use | File (night / day) |
|---|---|---|
| Mark | Favicon, app icons, tight spaces, the sign-in moment | `docs/brand/logo-mark.svg` / `logo-mark-light.svg` |
| Wordmark | Where the mark is already nearby | `logo-wordmark.svg` / `logo-wordmark-light.svg` |
| Lockup | Headers, the landing page, documents | `logo-lockup.svg` / `logo-lockup-light.svg` |

The files without a suffix are for dark backgrounds (ink `#e6edf8`, pupil `#86d8ff`); the `-light`
files are for light backgrounds (ink `#0b1426`, pupil `#0a6ea8`). Their letters are outlines, so they
look the same on a machine without Space Grotesk.

In the app, use the React component instead of the files. It follows the theme by itself:

```tsx
<Logo variant="lockup" title="SentinelOps" />   // named image for screen readers
<Logo variant="mark" size={20} />               // decorative, hidden from screen readers
<Logo variant="mark" size={96} animated />      // plays the wake once on mount
```

`size` is the height in pixels. Without `title` the logo is `aria-hidden`; give it a title when it is
the only thing naming the page or the link it sits in.

### Geometry

The mark sits on a 64-unit grid where 4 units are one pixel at 16 px. Every horizontal edge falls on
a multiple of 4, which keeps the slit between the lids two clean pixels wide in the favicon. The
paths live in `frontend/src/brand/geometry.ts`, and every file above is drawn from them.

The wordmark is "SentinelOps" in Space Grotesk 600 at -0.02em. The i has no round dot. Its dot is a
small diamond in the signal colour (the pupil again), centred over the stem. In the lockup the mark
is 1.5 times the cap height, with 0.32 em between the mark's right tip and the S.

### Clear space and size

Leave at least one pupil width (a quarter of the mark's width) clear on every side. Don't go smaller
than 20 px for the mark in the interface (16 px is for the favicon only) or 120 px wide for the
lockup.

### Colour on unknown backgrounds

Where the background can't be known in advance, the pupil uses the universal accent `#1596d6`. It
clears 3:1 on both backgrounds (5.75 on night, 3.07 on day). The Safari pinned-tab icon uses it, as
does `docs/brand/board/facet-mark.svg`. App icons avoid the question: the mark sits on a night tile
(`#0a1020`).

The favicon (`frontend/public/favicon.svg`) carries both depths and switches with a
`prefers-color-scheme` media query inside the SVG. Without that rule it shows the day colours.

## Palette

Two themes share one set of names. Night watch is the default; daylight watch follows the system
setting, or the toggle in the app.

| Token | Night | Day | Use |
|---|---|---|---|
| `--color-bg` | `#0a1020` | `#f4f7fb` | Page background |
| `--color-surface` | `#0f1729` | `#ffffff` | Cards, panels |
| `--color-surface-raised` | `#162139` | `#ffffff` | Menus, dialogs |
| `--color-border` | `#5f75a0` | `#7486a4` | Edges of controls (inputs, buttons) |
| `--color-border-subtle` | `#223050` | `#d9e1ec` | Decorative hairlines only |
| `--color-text` | `#e6edf8` | `#0b1426` | Body text |
| `--color-text-muted` | `#9eafcb` | `#46546d` | Secondary text, labels |
| `--color-signal` | `#86d8ff` | `#0a6ea8` | Links, the primary button, the pupil |
| `--color-signal-strong` | `#c4ecff` | `#06547f` | Hover on signal things, the focus ring |
| `--color-on-signal` | `#04121f` | `#ffffff` | Text on a signal fill |
| `--color-danger` | `#ff8f8f` | `#b42318` | Errors, destructive actions |

The signal is one ice-blue hue at two depths: light at night, deep by day. Both pass 4.5:1 as text,
so the signal can colour links and IDs as well as shapes. `signal-strong` always moves away from the
background, which makes hover read as "more" in both themes.

`--color-border-subtle` is low contrast on purpose (1.2 to 1.5:1). Use it for card edges, dividers and
table rules. Never let it be the only visible edge of something people click or type into; that edge
is `--color-border`, which is at least 3:1 on every surface.

### Severity and status

Severity has its own scale and never borrows the signal. Low is a steel blue-grey, so it can't be
mistaken for the green of "resolved". Status has a separate scale; "open" uses the signal blue,
because an open incident is waiting for eyes.

| Token | Night | Day | Badge cue |
|---|---|---|---|
| `--color-sev-critical` | `#ff7070` | `#b82525` | 4 of 4 bars |
| `--color-sev-high` | `#ffa24d` | `#a34a0b` | 3 of 4 bars |
| `--color-sev-medium` | `#f2c94c` | `#7d5800` | 2 of 4 bars |
| `--color-sev-low` | `#a7b6cf` | `#52607a` | 1 of 4 bars |
| `--color-status-open` | `#86d8ff` | `#0a6ea8` | Ring |
| `--color-status-investigating` | `#c3b1ff` | `#6a48c9` | Half-filled ring |
| `--color-status-resolved` | `#6fe3a2` | `#17703f` | Tick |
| `--color-status-closed` | `#8d9bb4` | `#5d6a80` | Filled dot |

Colour is never the only cue: severity badges carry a four-bar meter, status badges a glyph, and both
carry their word. A badge is the token colour as text on a tint of the same colour mixed over the
surface, 16% at night and 10% by day: `color-mix(in srgb, var(--c) 16%, var(--color-surface))`.

### Contrast

WCAG 2.1 contrast ratios, computed from the token values. Text needs 4.5:1; control edges and the
focus ring need 3:1. Every pair passes in both themes.

Night watch:

| Foreground | on bg | on surface | on raised | on its badge tint | needs |
|---|---:|---:|---:|---:|---:|
| `text` | 16.10 | 15.18 | 13.61 | | 4.5 |
| `text-muted` | 8.53 | 8.04 | 7.21 | | 4.5 |
| `signal` | 11.99 | 11.30 | 10.13 | | 4.5 |
| `signal-strong` | 15.15 | 14.29 | 12.81 | | 4.5 |
| `danger` | 8.65 | 8.15 | 7.31 | | 4.5 |
| `border` | 4.10 | 3.86 | 3.46 | | 3 |
| `focus` | 15.15 | 14.29 | 12.81 | | 3 |
| `sev-critical` | 7.04 | 6.64 | 5.95 | 5.32 | 4.5 |
| `sev-high` | 9.50 | 8.96 | 8.03 | 6.71 | 4.5 |
| `sev-medium` | 11.95 | 11.26 | 10.10 | 8.00 | 4.5 |
| `sev-low` | 9.24 | 8.71 | 7.81 | 6.43 | 4.5 |
| `status-open` | 11.99 | 11.30 | 10.13 | 7.82 | 4.5 |
| `status-investigating` | 9.98 | 9.41 | 8.43 | 6.78 | 4.5 |
| `status-resolved` | 11.90 | 11.22 | 10.06 | 7.82 | 4.5 |
| `status-closed` | 6.75 | 6.37 | 5.71 | 4.98 | 4.5 |
| `on-signal` on `signal` | 11.95 | | | | 4.5 |
| `on-signal` on `signal-strong` | 15.11 | | | | 4.5 |

Daylight watch:

| Foreground | on bg | on surface | on raised | on its badge tint | needs |
|---|---:|---:|---:|---:|---:|
| `text` | 17.11 | 18.38 | 18.38 | | 4.5 |
| `text-muted` | 7.11 | 7.64 | 7.64 | | 4.5 |
| `signal` | 5.13 | 5.51 | 5.51 | | 4.5 |
| `signal-strong` | 7.57 | 8.13 | 8.13 | | 4.5 |
| `danger` | 6.12 | 6.57 | 6.57 | | 4.5 |
| `border` | 3.44 | 3.69 | 3.69 | | 3 |
| `focus` | 7.57 | 8.13 | 8.13 | | 3 |
| `sev-critical` | 5.87 | 6.31 | 6.31 | 5.35 | 4.5 |
| `sev-high` | 5.52 | 5.93 | 5.93 | 5.13 | 4.5 |
| `sev-medium` | 5.98 | 6.43 | 6.43 | 5.55 | 4.5 |
| `sev-low` | 5.90 | 6.34 | 6.34 | 5.51 | 4.5 |
| `status-open` | 5.13 | 5.51 | 5.51 | 4.81 | 4.5 |
| `status-investigating` | 5.78 | 6.21 | 6.21 | 5.38 | 4.5 |
| `status-resolved` | 5.70 | 6.13 | 6.13 | 5.32 | 4.5 |
| `status-closed` | 5.09 | 5.47 | 5.47 | 4.80 | 4.5 |
| `on-signal` on `signal` | 5.51 | | | | 4.5 |
| `on-signal` on `signal-strong` | 8.13 | | | | 4.5 |

The tightest pairs are the day border on the page background (3.44) and the night border on a raised
surface (3.46). If you change a colour, rerun `node scripts/brand-board/gen-md.mjs` from `frontend/`
(after editing `scripts/brand-board/palette.mjs`) and update both tables.

## Type

Two families, both served from the site itself: Space Grotesk for headings and the interface,
JetBrains Mono for IDs, timestamps, counts and figures. Nothing is smaller than 12 px, and 12 px is
for mono only.

| Role | Font | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | Space Grotesk | 56/60 (40/44 under 640 px) | 600 | -0.03em | Landing hero only |
| H1 | Space Grotesk | 36/44 | 600 | -0.02em | Page titles |
| H2 | Space Grotesk | 24/32 | 600 | -0.01em | Section titles |
| H3 | Space Grotesk | 18/26 | 600 | -0.005em | Card and dialog titles |
| Body L | Space Grotesk | 18/28 | 400 | 0 | Landing copy |
| Body | Space Grotesk | 16/24 | 400 | 0 | Interface text, inputs |
| Small | Space Grotesk | 14/20 | 500 (600 on buttons) | 0.005em | Labels, buttons, help |
| Eyebrow | JetBrains Mono | 12/16 | 500 | 0.12em, capitals | Section labels |
| Data | JetBrains Mono | 14/20 | 400 | 0, tabular figures | IDs, counts, figures |
| Data S | JetBrains Mono | 12/16 | 500 | 0.02em | Timestamps |

Badges use Space Grotesk 13/16: 600 for severity, 500 for status.

## Motion

Motion in SentinelOps means one thing: the eye paying attention. It animates transform and opacity
only, plays once, and never stands between someone and their work.

| Name | What happens | Timing | Where |
|---|---|---|---|
| Wake | The eye starts shut, showing only the empty diamond socket. The lids part, then the pupil fades in, turning from a quarter turn and growing from half size. | Lids 560 ms ease-out after 200 ms; pupil 420 ms ease-out from 420 ms | `<Logo animated>`, the sign-in moment |
| Lock | The lids slide together until their points touch the pupil, the pupil ticks a quarter turn with a small scale pop, and the lids part. | Close 270 ms ease-in-out, tick 360 ms ease-out, open 360 ms ease-out | After sign-in succeeds |
| Idle scan | The pupil glides 4 units left, right and back, and one diamond ping passes under the lids. | 8 s loop, ease-in-out | Landing hero only |

Under `prefers-reduced-motion: reduce`, nothing travels or turns. Lock and wake become a 200 ms
fade or nothing at all (the `Logo` component simply renders still), and the idle scan doesn't run.
Working screens never use the brand motions; they use the presets in
`frontend/src/motion/presets.ts`.

The production Content Security Policy is `style-src 'self'`, so animation must not add `<style>`
elements to the page. Motion's `motion.*` components animate through `element.style`, which is
allowed; a test (`frontend/src/brand/Logo.test.tsx`) checks that the animated logo adds no `<style>`.
Avoid Motion features that do inject one, such as `AnimatePresence` with `mode="popLayout"`.

## Icons and link previews

All of these are generated from `geometry.ts` by `npm run icons` (in `frontend/`), and the results are
committed. The tests read the committed files.

| File | Size | What it is |
|---|---|---|
| `frontend/public/favicon.svg` | any | The mark, night or day by media query |
| `frontend/public/favicon-32.png` | 32 × 32 | PNG fallback on a night tile |
| `frontend/public/apple-touch-icon.png` | 180 × 180 | Home-screen icon on iOS |
| `frontend/public/icon-192.png`, `icon-512.png` | 192, 512 | Listed in `site.webmanifest` |
| `frontend/public/mask-icon.svg` | any | Safari pinned tab, one colour |
| `frontend/public/og-image.png` | 1200 × 630 | Link preview (Open Graph and Twitter) |
| `docs/images/social-card.png` | 1280 × 640 | GitHub social preview, uploaded by hand in the repository settings |

The wordmark's outlines come from `node scripts/outline-wordmark.mjs`, which writes
`frontend/src/brand/wordmark-path.ts`. Run it only if the wordmark's type changes. The brand board
itself is rebuilt with `npm run board`.

## Do and don't

Do:

- Keep the pupil the only signal-coloured part of the logo.
- Put the logo on `--color-bg` or `--color-surface`, or on a flat night tile.
- Use the `-light` files on light backgrounds and the plain ones on dark backgrounds.
- Pair every severity and status colour with its word and its meter or glyph.

Don't:

- Recolour the lids, outline the mark, add a glow or a gradient, or put it on a photo.
- Rotate, stretch or rearrange the mark and wordmark, or set the wordmark in another font.
- Use the signal colour for severity, or a severity colour for anything that isn't severity.
- Use `--color-border-subtle` as the edge of an input or button.
- Loop the idle scan anywhere except the landing hero, or animate anything under reduced motion
  beyond a short fade.
