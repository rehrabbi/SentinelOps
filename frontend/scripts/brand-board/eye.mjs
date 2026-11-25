// Geometry of the refined Facet mark, on a 64-unit grid that maps 4:1 onto a 16 px pixel grid.
// Every horizontal edge sits on a multiple of 4, so at 16 px the eye's slit is two crisp pixels.
export const UP = 'M2 28L32 8L62 28H44L32 20L20 28Z';
export const DOWN = 'M2 36H20L32 44L44 36H62L32 56Z';
export const PUPIL = 'M32 24L40 32L32 40L24 32Z';
export const UNIVERSAL_ACCENT = '#1596d6'; // clears 3:1 on both backgrounds: for files with no theme context

// Wordmark metrics at font-size 100, letter-spacing -2, as the approved board drew them. The board's
// renderer loaded every weight at once, which makes resvg pick 700 for 600; the shipped logo
// (src/brand/geometry.ts) is outlined from the 600 weight alone, with the tittle at x 229.75.
export const WM = { size: 100, ls: -2, baseline: 200, tittleX: 229.4, tittleY: 135, tittleR: 9.5, width: 562 };
export const WM_TEXT = 'SentınelOps';
export const tittle = (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;

// Lockup: visible mark height = 1.5 x cap height (cap = 70 at size 100); gap = 0.32 em.
export const LOCK = { scale: 2.1875, markTop: 95, textX: 164, viewBox: '0 95 724 140' };

// A still frame of the eye, for the PNG (resvg has no CSS animation).
export function eyeFrame({ ink, accent, dy = 0, rot = 0, s = 1, op = 1, dx = 0, ping = 0, pingOp = 0, all = 1 }) {
  const p = `translate(${32 + dx} 32) rotate(${rot}) scale(${s}) translate(-32 -32)`;
  let out = `<g opacity="${all}">`;
  out += `<path fill="${ink}" d="${UP}" transform="translate(0 ${dy})"/>`;
  out += `<path fill="${ink}" d="${DOWN}" transform="translate(0 ${-dy})"/>`;
  out += `<path fill="${accent}" opacity="${op}" d="${PUPIL}" transform="${p}"/>`;
  if (pingOp > 0)
    out += `<path fill="none" stroke="${accent}" stroke-width="${1.5 / ping}" opacity="${pingOp}" d="${PUPIL}" transform="translate(32 32) scale(${ping}) translate(-32 -32)"/>`;
  return out + '</g>';
}
