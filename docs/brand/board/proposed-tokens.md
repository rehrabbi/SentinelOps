# Proposed tokens (brand board, sign-off 2)

These are the values the brand board proposes for `frontend/src/styles/tokens.css`. Nothing here is in the
app yet. Once the owner approves the board, Task 5b copies them in. The token names stay as they are,
with one addition, `--color-border-subtle`, explained below.

Live board: `docs/brand/board/index.html`. Static render: `docs/brand/board/board.png`.

## Night watch (dark)

Replaces the colour values in the `:root, :root[data-theme='dark']` block.

```css
  --color-bg: #0a1020;
  --color-surface: #0f1729;
  --color-surface-raised: #162139;
  --color-border: #5f75a0;
  --color-border-subtle: #223050; /* new */
  --color-text: #e6edf8;
  --color-text-muted: #9eafcb;
  --color-signal: #86d8ff;
  --color-signal-strong: #c4ecff;
  --color-on-signal: #04121f;
  --color-danger: #ff8f8f;
  --color-sev-critical: #ff7070;
  --color-sev-high: #ffa24d;
  --color-sev-medium: #f2c94c;
  --color-sev-low: #a7b6cf;
  --color-status-open: #86d8ff;
  --color-status-investigating: #c3b1ff;
  --color-status-resolved: #6fe3a2;
  --color-status-closed: #8d9bb4;
  --color-focus: var(--color-signal-strong);
```

## Daylight watch (light)

Replaces the colour values in both light blocks (the `prefers-color-scheme: light` block and
`:root[data-theme='light']`). They must stay identical.

```css
  --color-bg: #f4f7fb;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-border: #7486a4;
  --color-border-subtle: #d9e1ec; /* new */
  --color-text: #0b1426;
  --color-text-muted: #46546d;
  --color-signal: #0a6ea8;
  --color-signal-strong: #06547f;
  --color-on-signal: #ffffff;
  --color-danger: #b42318;
  --color-sev-critical: #b82525;
  --color-sev-high: #a34a0b;
  --color-sev-medium: #7d5800;
  --color-sev-low: #52607a;
  --color-status-open: #0a6ea8;
  --color-status-investigating: #6a48c9;
  --color-status-resolved: #17703f;
  --color-status-closed: #5d6a80;
  --color-focus: var(--color-signal-strong);
```

`--shadow-raised`, spacing, radii, fonts, easing and durations stay as they are today. `--color-focus`
is declared once, in the dark block, as `var(--color-signal-strong)`; because every block sets its
properties on `:root`, it resolves to each theme's own `signal-strong` (`#06547f` by day), so the light
blocks need no line for it.

## Notes on use

- **Signal is one hue at two depths.** Ice blue (hue 199 to 202), light at night (`#86d8ff`) and deep
  by day (`#0a6ea8`). Both pass 4.5:1 for text on every surface in their theme, so the signal can
  colour links, IDs and the primary button, not only shapes. This resolves the exploration's problem:
  `#7dd3fc` was 1.57:1 on the light background and `#1596d6` was dull at night.
- **`signal-strong`** is the hover state of signal-coloured things and the focus ring. At night it is
  lighter (`#c4ecff`, a near-white ice); by day it is darker (`#06547f`). In both cases it moves away
  from the background, so hover reads as "more".
- **Universal accent `#1596d6`.** A logo file with no theme around it (the standalone
  `facet-mark.svg`, a README, a social card on an unknown background) uses `#1596d6`, which clears 3:1
  on both backgrounds (5.75 on night, 3.07 on day). Inside the app the pupil uses `var(--color-signal)`.
  The favicon should pick night or day colours with a `prefers-color-scheme` media query inside the SVG.
- **Severity never uses the signal.** Critical red, high orange, medium amber, low steel (a neutral
  blue-grey, so it doesn't clash with the green of "resolved"). Severity badges also carry a
  four-bar meter (4, 3, 2 or 1 bars lit), so colour is never the only cue.
- **Status** has its own scale: open is the signal blue ("awaiting eyes"), investigating violet (so it
  doesn't share amber with medium severity), resolved green, closed grey. Each status badge carries a
  glyph: ring, half-filled ring, tick, filled dot.
- **Badges**: text in the token colour on a tint of the same colour mixed over `--color-surface`
  (16% at night, 10% by day): `color-mix(in srgb, var(--c) 16%, var(--color-surface))`. Mix over
  `surface`, not over whatever is behind the badge, so the ratios below hold everywhere.
- **`--color-border-subtle` (new)** is for decorative hairlines: card edges, dividers, table rules.
  It is deliberately low contrast and must never be the only visible edge of a control. Inputs,
  secondary buttons and anything that needs a 3:1 boundary use `--color-border`. Without this token
  every card edge would need 3:1, which looks heavy and dashboard-generic.

## Contrast (WCAG 2.1 relative luminance)

Text needs 4.5:1; interface parts (borders of controls, the focus ring) need 3:1. Every pair passes;
the tightest is `--color-border` on `--color-surface-raised` at night (3.46, needs 3).

### Night watch

| Foreground | on bg | on surface | on surface-raised | badge (on own tint) | needs |
|---|---:|---:|---:|---:|---:|
| `text` #e6edf8 | 16.10 | 15.18 | 13.61 | – | 4.5 |
| `text-muted` #9eafcb | 8.53 | 8.04 | 7.21 | – | 4.5 |
| `signal` #86d8ff | 11.99 | 11.30 | 10.13 | – | 4.5 |
| `signal-strong` #c4ecff | 15.15 | 14.29 | 12.81 | – | 4.5 |
| `danger` #ff8f8f | 8.65 | 8.15 | 7.31 | – | 4.5 |
| `border` #5f75a0 | 4.10 | 3.86 | 3.46 | – | 3 |
| `focus` #c4ecff | 15.15 | 14.29 | 12.81 | – | 3 |
| `sev-critical` #ff7070 | 7.04 | 6.64 | 5.95 | 5.32 | 4.5 |
| `sev-high` #ffa24d | 9.50 | 8.96 | 8.03 | 6.71 | 4.5 |
| `sev-medium` #f2c94c | 11.95 | 11.26 | 10.10 | 8.00 | 4.5 |
| `sev-low` #a7b6cf | 9.24 | 8.71 | 7.81 | 6.43 | 4.5 |
| `status-open` #86d8ff | 11.99 | 11.30 | 10.13 | 7.82 | 4.5 |
| `status-investigating` #c3b1ff | 9.98 | 9.41 | 8.43 | 6.78 | 4.5 |
| `status-resolved` #6fe3a2 | 11.90 | 11.22 | 10.06 | 7.82 | 4.5 |
| `status-closed` #8d9bb4 | 6.75 | 6.37 | 5.71 | 4.98 | 4.5 |
| `on-signal` #04121f on `signal` | 11.95 | | | – | 4.5 |
| `on-signal` on `signal-strong` (hover) | 15.11 | | | – | 4.5 |

### Daylight watch

| Foreground | on bg | on surface | on surface-raised | badge (on own tint) | needs |
|---|---:|---:|---:|---:|---:|
| `text` #0b1426 | 17.11 | 18.38 | 18.38 | – | 4.5 |
| `text-muted` #46546d | 7.11 | 7.64 | 7.64 | – | 4.5 |
| `signal` #0a6ea8 | 5.13 | 5.51 | 5.51 | – | 4.5 |
| `signal-strong` #06547f | 7.57 | 8.13 | 8.13 | – | 4.5 |
| `danger` #b42318 | 6.12 | 6.57 | 6.57 | – | 4.5 |
| `border` #7486a4 | 3.44 | 3.69 | 3.69 | – | 3 |
| `focus` #06547f | 7.57 | 8.13 | 8.13 | – | 3 |
| `sev-critical` #b82525 | 5.87 | 6.31 | 6.31 | 5.35 | 4.5 |
| `sev-high` #a34a0b | 5.52 | 5.93 | 5.93 | 5.13 | 4.5 |
| `sev-medium` #7d5800 | 5.98 | 6.43 | 6.43 | 5.55 | 4.5 |
| `sev-low` #52607a | 5.90 | 6.34 | 6.34 | 5.51 | 4.5 |
| `status-open` #0a6ea8 | 5.13 | 5.51 | 5.51 | 4.81 | 4.5 |
| `status-investigating` #6a48c9 | 5.78 | 6.21 | 6.21 | 5.38 | 4.5 |
| `status-resolved` #17703f | 5.70 | 6.13 | 6.13 | 5.32 | 4.5 |
| `status-closed` #5d6a80 | 5.09 | 5.47 | 5.47 | 4.80 | 4.5 |
| `on-signal` #ffffff on `signal` | 5.51 | | | – | 4.5 |
| `on-signal` on `signal-strong` (hover) | 8.13 | | | – | 4.5 |

## Type scale

Space Grotesk for headings and interface, JetBrains Mono for IDs, timestamps, counts and data. Nothing
smaller than 12 px, and 12 px only in mono.

| Role | Font | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | Space Grotesk | 56/60 (40/44 under 640 px) | 600 | -0.03em | Landing hero only |
| H1 | Space Grotesk | 36/44 | 600 | -0.02em | Page titles |
| H2 | Space Grotesk | 24/32 | 600 | -0.01em | Section titles |
| H3 | Space Grotesk | 18/26 | 600 | -0.005em | Card and dialog titles |
| Body L | Space Grotesk | 18/28 | 400 | 0 | Landing copy |
| Body | Space Grotesk | 16/24 | 400 | 0 | Interface text, inputs |
| Small | Space Grotesk | 14/20 | 500 (600 on buttons) | 0.005em | Labels, buttons, help |
| Eyebrow | JetBrains Mono | 12/16 | 500 | 0.12em, uppercase | Section labels |
| Data | JetBrains Mono | 14/20 | 400 | 0, tabular figures | IDs, counts, figures |
| Data S | JetBrains Mono | 12/16 | 500 | 0.02em | Timestamps |

Badges: Space Grotesk 13/16, 600 for severity and 500 for status.

## Logo geometry (for Task 5b)

- Mark, 64-unit grid (each 4 units is one pixel at 16 px):
  upper lid `M2 28L32 8L62 28H44L32 20L20 28Z`, lower lid `M2 36H20L32 44L44 36H62L32 56Z`,
  pupil `M32 24L40 32L32 40L24 32Z`. The lids are `currentColor`; the pupil is the signal colour.
  File: `docs/brand/board/facet-mark.svg`.
- Wordmark: "SentinelOps" in Space Grotesk 600, letter-spacing -0.02em. The i is a dotless i (U+0131)
  with a diamond tittle in the signal colour. At font-size 100 with the text starting at x 0 and the
  baseline at y 200, the tittle is centred at (229.4, 135) with a half-diagonal of 9.5. For the shipped
  SVG files the text should be converted to outlines, so they don't depend on an installed font.
- Lockup: the mark's visible height is 1.5 times the cap height (mark box = 1.4 em, scale 2.1875 from
  the 64 grid); 0.32 em between the mark's right tip and the S. ViewBox at size 100: `0 95 724 140`,
  mark box at (0, 95), text at x 164.
- Clear space: one pupil width (a quarter of the mark's width) on every side. Smallest sizes: mark
  16 px (favicon only), 20 px in the interface; lockup 120 px wide.
- App icons (192, 512, apple-touch): the mark on a night tile (`#0a1020`), because the icon's
  background is unknown.

## Motion (for the `Logo` component)

Transform and opacity only. In the app each plays once; under `prefers-reduced-motion: reduce` there is
no travel and no turn.

| Name | What happens | Timing | Where |
|---|---|---|---|
| Lock | Lids slide 4 units towards each other (the slit closes and their inner points meet the pupil's tips), the pupil turns 90° with a brief 1.14 scale, the lids part | close 270 ms `--ease-in-out`; tick 360 ms `--ease-out`; open 360 ms `--ease-out` | After sign-in succeeds, session verified |
| Wake | Starts shut with no pupil; the lids part, then the pupil fades in, turning from -90° and growing from 0.5 | lids 560 ms `--ease-out` after 200 ms; pupil 420 ms `--ease-out`, starting 220 ms after the lids | The sign-in moment (`<Logo animated>`) |
| Idle scan | The pupil glides 4 units left, then right, then back; one diamond ping (outline, scale 1 to 2.8, fading) | 8 s loop, `--ease-in-out` | Landing hero only |
| Reduced | Lock and wake become a 200 ms linear fade; idle scan does not run | 200 ms | Everywhere, under reduced motion |
