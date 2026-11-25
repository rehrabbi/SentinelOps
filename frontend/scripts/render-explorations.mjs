// Renders the logo explorations in docs/brand/explorations/ into a contact sheet:
// index.html (static, no scripts) and contact-sheet.png (via @resvg/resvg-js).
// Run from frontend/:  node scripts/render-explorations.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'docs', 'brand', 'explorations');

// Values from frontend/src/styles/tokens.css (placeholder palette).
const THEMES = [
  { name: 'Dark', bg: '#0a1020', fg: '#e8eef9', muted: '#a3b3cf' },
  { name: 'Light', bg: '#f6f8fc', fg: '#0b1426', muted: '#4a5973' },
];
const ACCENT = '#1596d6';

const CANDIDATES = [
  {
    letter: 'A',
    file: 'a-ward.svg',
    name: 'Ward',
    concept: 'A shield whose crest is a raised brow; the eye is cut out of the shield and the pupil glows ice blue.',
    motion: 'Blink: the cut-out closes to a line and reopens, then the pupil brightens once.',
  },
  {
    letter: 'B',
    file: 'b-gaze.svg',
    name: 'Gaze',
    concept: 'Two crescent lids, sharp at the corners, around an ice-blue iris; the eye itself, wide awake.',
    motion: 'Look: the iris glides left, then right, then back to centre, as if checking the room; lids narrow slightly.',
  },
  {
    letter: 'C',
    file: 'c-facet.svg',
    name: 'Facet',
    concept: 'An eye drawn in straight lines: two chevrons for lids (the lower one a shield point) and a diamond pupil.',
    motion: 'Lock: the chevrons close onto the pupil like a shutter and part again; the diamond ticks a quarter turn.',
  },
  {
    letter: 'D',
    file: 'd-visor.svg',
    name: 'Visor',
    concept: 'An eye cut into three horizontal bands, like the slot of a visor; the pupil is a lit ice-blue block.',
    motion: 'Scan: the bands light top to bottom in turn, then the pupil settles; one pass of a scanner.',
  },
  {
    letter: 'E',
    file: 'e-scope.svg',
    name: 'Scope',
    concept: 'A radar scope seen as an eye: the ring is the iris, the centre the pupil, the ice-blue sector the beam.',
    motion: 'Sweep: the beam turns once around the ring and comes to rest at the top; the gap in the ring travels with it.',
  },
];

const read = (f) => readFileSync(join(dir, f), 'utf8');

// Inner markup and viewBox of a candidate, so it can be nested at any size and colour.
function parts(svg) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)[1];
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { viewBox, inner };
}

function place(svg, x, y, size, color) {
  const { viewBox, inner } = parts(svg);
  return `<g color="${color}"><svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg></g>`;
}

// A true 16 px rasterisation, returned as PNG bytes (to be shown magnified, pixel for pixel).
function raster16(svg, theme) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="${theme.bg}"/>${place(svg, 0, 0, 16, theme.fg)}</svg>`;
  return new Resvg(doc).render().asPng();
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- PNG contact sheet ----------
const W = 1600;
const M = 56;
const HEADER = 150;
const ROW = 268;
const H = HEADER + CANDIDATES.length * ROW + 56;
const PANEL_W = 486;
const PANEL_H = 236;
const panelX = [W - M - PANEL_W * 2 - 20, W - M - PANEL_W];
const SANS = "'Segoe UI', 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif";
const MONO = "Consolas, 'DejaVu Sans Mono', monospace";
const sheet = THEMES[0];

let body = '';
body += `<text x="${M}" y="70" font-family="${SANS}" font-size="30" font-weight="600" fill="${sheet.fg}" letter-spacing="0.5">SentinelOps · logo explorations</text>`;
body += `<text x="${M}" y="104" font-family="${MONO}" font-size="15" fill="${sheet.muted}">Each mark at 180, 32 and 16 px; the last tile is the real 16 px render magnified four times. Ink is currentColor; accent ${ACCENT}.</text>`;
for (let p = 0; p < 2; p++) {
  body += `<text x="${panelX[p]}" y="${HEADER - 12}" font-family="${MONO}" font-size="13" fill="${sheet.muted}" letter-spacing="2">${THEMES[p].name.toUpperCase()} ${THEMES[p].bg}</text>`;
}

CANDIDATES.forEach((c, i) => {
  const svg = read(c.file);
  const y = HEADER + i * ROW;
  body += `<line x1="${M}" y1="${y - 1}" x2="${W - M}" y2="${y - 1}" stroke="#1c2840" stroke-width="1"/>`;
  body += `<text x="${M}" y="${y + 62}" font-family="${SANS}" font-size="54" font-weight="300" fill="${ACCENT}">${c.letter}</text>`;
  body += `<text x="${M + 52}" y="${y + 60}" font-family="${SANS}" font-size="26" font-weight="600" fill="${sheet.fg}">${esc(c.name)}</text>`;
  let ty = y + 100;
  for (const line of wrap(c.concept, 46)) {
    body += `<text x="${M}" y="${ty}" font-family="${SANS}" font-size="15" fill="${sheet.fg}">${esc(line)}</text>`;
    ty += 21;
  }
  ty += 8;
  body += `<text x="${M}" y="${ty}" font-family="${MONO}" font-size="12" fill="${ACCENT}" letter-spacing="2">MOTION</text>`;
  ty += 21;
  for (const line of wrap(c.motion, 46)) {
    body += `<text x="${M}" y="${ty}" font-family="${SANS}" font-size="15" fill="${sheet.muted}">${esc(line)}</text>`;
    ty += 21;
  }

  THEMES.forEach((t, p) => {
    const px = panelX[p];
    const py = y + 12;
    body += `<rect x="${px}" y="${py}" width="${PANEL_W}" height="${PANEL_H}" rx="10" fill="${t.bg}" stroke="${p === 0 ? '#1c2840' : 'none'}"/>`;
    body += place(svg, px + 24, py + 22, 180, t.fg);
    const sx = px + 236;
    const mid = py + 22 + 90;
    body += place(svg, sx, mid - 16, 32, t.fg);
    body += place(svg, sx + 60, mid - 8, 16, t.fg);
    const png = raster16(svg, t).toString('base64');
    body += `<image x="${sx + 104}" y="${mid - 32}" width="64" height="64" image-rendering="optimizeSpeed" href="data:image/png;base64,${png}"/>`;
    const labels = [
      [px + 24 + 90, '180'],
      [sx + 16, '32'],
      [sx + 68, '16'],
      [sx + 136, '16 ×4'],
    ];
    for (const [lx, l] of labels) {
      body += `<text x="${lx}" y="${py + PANEL_H - 12}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${t.muted}">${l}</text>`;
    }
  });
});

body += `<text x="${M}" y="${H - 24}" font-family="${MONO}" font-size="13" fill="${sheet.muted}">Chosen: awaiting the owner</text>`;

const composition = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#070c18"/>${body}</svg>`;
const png = new Resvg(composition, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng();
writeFileSync(join(dir, 'contact-sheet.png'), png);

// ---------- Static HTML contact sheet ----------
const sized = (svg, size) =>
  svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}" aria-hidden="true"`).trim();

let rows = '';
for (const c of CANDIDATES) {
  const svg = read(c.file);
  let panels = '';
  for (const t of THEMES) {
    const png16 = raster16(svg, t).toString('base64');
    panels += `
      <div class="panel ${t.name.toLowerCase()}">
        <figure>${sized(svg, 180)}<figcaption>180</figcaption></figure>
        <figure>${sized(svg, 32)}<figcaption>32</figcaption></figure>
        <figure>${sized(svg, 16)}<figcaption>16</figcaption></figure>
        <figure><img class="px" src="data:image/png;base64,${png16}" width="64" height="64" alt=""><figcaption>16 &times;4</figcaption></figure>
      </div>`;
  }
  rows += `
    <section>
      <div class="about">
        <h2><span>${c.letter}</span> ${esc(c.name)}</h2>
        <p>${esc(c.concept)}</p>
        <p class="motion"><b>Motion</b> ${esc(c.motion)}</p>
        <p class="file">${c.file}</p>
      </div>${panels}
    </section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SentinelOps logo explorations</title>
<style>
  :root { --accent: ${ACCENT}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 24px; background: #070c18; color: #e8eef9;
    font: 15px/1.45 'Space Grotesk', 'Segoe UI', system-ui, sans-serif; }
  header, section { max-width: 1500px; margin: 0 auto; }
  h1 { font-weight: 600; font-size: 28px; margin: 0 0 6px; }
  header p, .file, figcaption { font-family: 'JetBrains Mono', Consolas, monospace; color: #a3b3cf; font-size: 13px; }
  section { display: grid; grid-template-columns: minmax(240px, 1fr) auto auto; gap: 20px; align-items: center;
    padding: 24px 0; border-top: 1px solid #1c2840; }
  h2 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
  h2 span { color: var(--accent); font-weight: 300; font-size: 40px; margin-right: 6px; }
  .about p { margin: 0 0 8px; max-width: 46ch; }
  .motion { color: #a3b3cf; }
  .motion b { color: var(--accent); font: 600 12px 'JetBrains Mono', Consolas, monospace; letter-spacing: 2px;
    text-transform: uppercase; margin-right: 6px; }
  .panel { display: flex; align-items: center; gap: 24px; padding: 20px 24px; border-radius: 10px; }
  .dark { background: #0a1020; color: #e8eef9; border: 1px solid #1c2840; }
  .light { background: #f6f8fc; color: #0b1426; }
  .light figcaption { color: #4a5973; }
  figure { margin: 0; display: grid; justify-items: center; gap: 10px; }
  .px { image-rendering: pixelated; }
  footer { max-width: 1500px; margin: 24px auto 0; font-family: 'JetBrains Mono', Consolas, monospace; color: #a3b3cf; }
  @media (max-width: 1100px) { section { grid-template-columns: 1fr; } .panel { flex-wrap: wrap; } }
</style>
</head>
<body>
<header>
  <h1>SentinelOps &middot; logo explorations</h1>
  <p>Each mark at 180, 32 and 16 px on the dark and light backgrounds; the last tile is the real 16 px render magnified four times. Ink is currentColor; accent ${ACCENT}. Generated by frontend/scripts/render-explorations.mjs.</p>
</header>${rows}
<footer>Chosen: awaiting the owner</footer>
</body>
</html>
`;
writeFileSync(join(dir, 'index.html'), html);

console.log(`wrote ${join(dir, 'contact-sheet.png')} (${W}x${H}) and index.html`);
