// Writes every logo file and icon from the geometry in src/brand/geometry.ts:
//   public/favicon.svg, public/mask-icon.svg, docs/brand/logo-{mark,wordmark,lockup}[-light].svg,
//   and, rendered with @resvg/resvg-js, public/favicon-32.png, apple-touch-icon.png, icon-192.png,
//   icon-512.png, og-image.png (1200x630) and docs/images/social-card.png (1280x640).
// Run from frontend/ with `npm run icons`, then commit the results. The tests read the committed
// files; nothing is generated during `npm test`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  BRAND_COLORS,
  LID_LOWER,
  LID_UPPER,
  LOCKUP_MARK,
  LOCKUP_TEXT_X,
  LOCKUP_VIEWBOX,
  PUPIL,
  TITTLE,
  WORDMARK_VIEWBOX,
} from '../src/brand/geometry.ts';
import { WORDMARK_PATH } from '../src/brand/wordmark-path.ts';
import { brandFont } from './brand-board/woff2ttf.mjs';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(frontend, '..');
const { night, day } = BRAND_COLORS;
const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`wrote ${relative(repo, path).replaceAll('\\', '/')}`);
}

// ---- Building blocks (plain SVG markup, no scripts, no external references) ----

const eye = (ink, signal) =>
  `<path fill="${ink}" d="${LID_UPPER}"/><path fill="${ink}" d="${LID_LOWER}"/><path fill="${signal}" d="${PUPIL}"/>`;
const wordmark = (ink, signal) => `<path fill="${ink}" d="${WORDMARK_PATH}"/><path fill="${signal}" d="${TITTLE}"/>`;
const lockup = (ink, signal) =>
  `<g transform="translate(${LOCKUP_MARK.x} ${LOCKUP_MARK.y}) scale(${LOCKUP_MARK.scale})">${eye(ink, signal)}</g>` +
  `<g transform="translate(${LOCKUP_TEXT_X} 0)">${wordmark(ink, signal)}</g>`;

/** A drawing nested at (x, y), scaled from its own viewBox to the given width. */
function place(viewBox, body, x, y, width) {
  const [vx, vy, vw, vh] = viewBox;
  const s = width / vw;
  return { height: vh * s, svg: `<g transform="translate(${x} ${y}) scale(${s}) translate(${-vx} ${-vy})">${body}</g>` };
}

// ---- Favicon and Safari pinned-tab icon ----

// Day colours as attributes (what shows if the <style> is ignored); the media query switches to the
// night depth of the signal in a dark browser. The universal accent is not used here because each
// depth reads better on its own background.
const favicon =
  `<svg ${SVG_NS} viewBox="0 0 64 64">` +
  `<style>.lid{fill:${day.ink}}.pupil{fill:${day.signal}}` +
  `@media (prefers-color-scheme: dark){.lid{fill:${night.ink}}.pupil{fill:${night.signal}}}</style>` +
  `<path class="lid" fill="${day.ink}" d="${LID_UPPER}"/><path class="lid" fill="${day.ink}" d="${LID_LOWER}"/>` +
  `<path class="pupil" fill="${day.signal}" d="${PUPIL}"/></svg>\n`;
write(join(frontend, 'public/favicon.svg'), favicon);

// Safari tints a mask icon with the colour in <link rel="mask-icon" color>: one solid colour only.
write(join(frontend, 'public/mask-icon.svg'), `<svg ${SVG_NS} viewBox="0 0 64 64">${eye('#000', '#000')}</svg>\n`);

// ---- Standalone logo files: night colours by default, day colours in the -light files ----

const LOGOS = {
  mark: { viewBox: [0, 0, 64, 64], size: [256, 256], body: eye },
  wordmark: { viewBox: WORDMARK_VIEWBOX, size: [WORDMARK_VIEWBOX[2], WORDMARK_VIEWBOX[3]], body: wordmark },
  lockup: { viewBox: LOCKUP_VIEWBOX, size: [LOCKUP_VIEWBOX[2], LOCKUP_VIEWBOX[3]], body: lockup },
};
for (const [name, logo] of Object.entries(LOGOS)) {
  for (const [suffix, c] of [['', night], ['-light', day]]) {
    const svg =
      `<svg ${SVG_NS} viewBox="${logo.viewBox.join(' ')}" width="${logo.size[0]}" height="${logo.size[1]}">` +
      `<title>SentinelOps</title>${logo.body(c.ink, c.signal)}</svg>\n`;
    write(join(repo, `docs/brand/logo-${name}${suffix}.svg`), svg);
  }
}

// ---- PNG icons: the mark on a night tile, because the background behind an icon is unknown ----

const png = (svg, fontFiles = []) =>
  new Resvg(svg, { font: { fontFiles, loadSystemFonts: false }, shapeRendering: 2 }).render().asPng();

/** The mark centred on a night tile, its width a share of the tile. */
function tile(size, share, radius = 0) {
  const w = size * share;
  const mark = place([0, 0, 64, 64], eye(night.ink, night.signal), (size - w) / 2, (size - w) / 2, w);
  return `<svg ${SVG_NS} width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${night.bg}"/>${mark.svg}</svg>`;
}

// 32 px: the 64-unit grid at exactly half scale, so every horizontal edge lands on a pixel.
write(join(frontend, 'public/favicon-32.png'), png(tile(32, 1, 6)));
// The mark's corners stay inside the central 80% circle, so the tiles also survive a round mask.
write(join(frontend, 'public/apple-touch-icon.png'), png(tile(180, 0.6)));
write(join(frontend, 'public/icon-192.png'), png(tile(192, 0.6)));
write(join(frontend, 'public/icon-512.png'), png(tile(512, 0.6)));

// ---- Link preview and GitHub social card ----

// One weight per family: with several weights of a family loaded, resvg picks the wrong one.
const FONTS = [brandFont('Space Grotesk', 500), brandFont('JetBrains Mono', 500)];
const TAGLINE = 'Incident tracking, watched closely.';
const URL_TEXT = 'sentinelops.pages.dev';

function social(width, height) {
  const lockupWidth = Math.round(width * 0.52);
  const lockupHeight = (lockupWidth * LOCKUP_VIEWBOX[3]) / LOCKUP_VIEWBOX[2];
  const taglineSize = Math.round(width * 0.03);
  const urlSize = Math.round(width * 0.0165);
  // Stack the lockup and tagline as one block, centred vertically (nudged up for the address below).
  const gap = taglineSize * 1.5;
  const top = (height - (lockupHeight + gap + taglineSize)) / 2 - height * 0.03;
  const lockupSvg = place(LOCKUP_VIEWBOX, lockup(night.ink, night.signal), (width - lockupWidth) / 2, top, lockupWidth).svg;
  const taglineY = top + lockupHeight + gap + taglineSize * 0.75;
  // The eye's slit, drawn across the card as two hairlines either side of the address.
  const urlY = height - height * 0.12;
  const lineY = urlY - urlSize * 0.35;
  const halfUrl = urlSize * 0.6 * URL_TEXT.length * 0.5 + urlSize;
  const rule = (x1, x2) => `<line x1="${x1}" y1="${lineY}" x2="${x2}" y2="${lineY}" stroke="${night.rule}" stroke-width="1"/>`;
  return (
    `<svg ${SVG_NS} width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${night.bg}"/>` +
    lockupSvg +
    `<text x="${width / 2}" y="${taglineY}" text-anchor="middle" font-family="Space Grotesk" font-weight="500" font-size="${taglineSize}" fill="${night.muted}">${TAGLINE}</text>` +
    rule(width * 0.08, width / 2 - halfUrl) +
    rule(width / 2 + halfUrl, width * 0.92) +
    `<text x="${width / 2}" y="${urlY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="${urlSize}" letter-spacing="${urlSize * 0.04}" fill="${night.signal}">${URL_TEXT}</text>` +
    `</svg>`
  );
}

write(join(frontend, 'public/og-image.png'), png(social(1200, 630), FONTS));
write(join(repo, 'docs/images/social-card.png'), png(social(1280, 640), FONTS));
