// Geometry and fixed colours of the SentinelOps logo ("Facet"). The React component, the icon
// script (scripts/render-icons.mjs) and the brand board scripts all read this file, so the mark is
// drawn from one source. Plain constants only: Node runs it directly with type stripping.

/**
 * The mark on a 64-unit grid. Every horizontal edge sits on a multiple of 4, so at 16 px (4 units
 * per pixel) the slit between the lids is two crisp pixels. The lids are the ink colour, the
 * diamond pupil the signal colour.
 */
export const MARK_SIZE = 64
export const LID_UPPER = 'M2 28L32 8L62 28H44L32 20L20 28Z'
export const LID_LOWER = 'M2 36H20L32 44L44 36H62L32 56Z'
export const PUPIL = 'M32 24L40 32L32 40L24 32Z'

/** How far each lid slides to shut the eye: the slit closes and the lids' points meet the pupil's tips. */
export const LID_TRAVEL = 4

/**
 * The wordmark is "SentinelOps" in Space Grotesk 600 at -0.02em, set at font-size 100 from x 0 with
 * the baseline at y 200, and outlined (wordmark-path.ts). The i is dotless; its dot is a diamond in
 * the signal colour, centred over the stem (x 229.75 in the 600 weight).
 */
export const WORDMARK_VIEWBOX = [0, 118, 562, 108] as const
export const TITTLE = 'M229.75 125.5L239.25 135L229.75 144.5L220.25 135Z'

/** Lockup: the mark is 1.5 times the cap height, with 0.32 em between the mark and the S. */
export const LOCKUP_VIEWBOX = [0, 95, 724, 140] as const
export const LOCKUP_MARK = { x: 0, y: 95, scale: 2.1875 } as const
export const LOCKUP_TEXT_X = 164

/** Colours for files that have no theme around them (icons, standalone logos, social images). */
export const BRAND_COLORS = {
  night: { bg: '#0a1020', ink: '#e6edf8', muted: '#9eafcb', signal: '#86d8ff', rule: '#223050' },
  day: { bg: '#f4f7fb', ink: '#0b1426', muted: '#46546d', signal: '#0a6ea8' },
  /** Clears 3:1 on both backgrounds: for places where the background is unknown. */
  accent: '#1596d6',
} as const
