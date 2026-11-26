// Renders docs/brand/board/board.png (1600 px wide) from an SVG composition, with the real fonts.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { brandFontFiles } from './woff2ttf.mjs';
import { THEMES, ratio, mix, TINT } from './palette.mjs';
import { WM, WM_TEXT, tittle, LOCK, eyeFrame } from './eye.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'brand', 'board');
const fontFiles = brandFontFiles();
const ROPTS = { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' } };
const D = THEMES.dark, L = THEMES.light;
const SANS = 'Space Grotesk', MONO = 'JetBrains Mono';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cache = new Map();
function measure(str, fam, weight, size, ls = 0) {
  const k = [str, fam, weight, size, ls].join('|');
  if (!cache.has(k)) {
    const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="200"><text x="0" y="150" font-family="${fam}" font-weight="${weight}" font-size="${size}" letter-spacing="${ls}">${esc(str)}</text></svg>`, ROPTS);
    const b = r.getBBox();
    cache.set(k, b ? b.x + b.width : 0);
  }
  return cache.get(k);
}
const T = (x, y, s, { size = 16, w = 400, fam = SANS, fill, ls = 0, anchor = 'start', op } = {}) =>
  `<text${/  /.test(s) ? ' xml:space="preserve"' : ''} x="${x}" y="${y}" font-family="${fam}" font-weight="${w}" font-size="${size}" letter-spacing="${ls}" fill="${fill}" text-anchor="${anchor}"${op ? ` opacity="${op}"` : ''}>${esc(s)}</text>`;
const eyeAt = (x, y, size, t, frame = {}) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64">${eyeFrame({ ink: t.text, accent: t.signal, ...frame })}</svg>`;
function lockupAt(x, y, width, t) {
  const [, , vw, vh] = LOCK.viewBox.split(' ').map(Number);
  const h = (width * vh) / vw;
  return { h, svg: `<svg x="${x}" y="${y}" width="${width}" height="${h}" viewBox="${LOCK.viewBox}"><g transform="translate(0 ${LOCK.markTop}) scale(${LOCK.scale})">${eyeFrame({ ink: t.text, accent: t.signal })}</g><g transform="translate(${LOCK.textX} 0)"><text x="0" y="${WM.baseline}" font-family="${SANS}" font-weight="600" font-size="${WM.size}" letter-spacing="${WM.ls}" fill="${t.text}">${WM_TEXT}</text><path fill="${t.signal}" d="${tittle(WM.tittleX, WM.tittleY, WM.tittleR)}"/></g></svg>` };
}
function wordmarkAt(x, y, width, t) {
  const h = (width * 108) / WM.width;
  return `<svg x="${x}" y="${y}" width="${width}" height="${h}" viewBox="0 118 ${WM.width} 108"><text x="0" y="${WM.baseline}" font-family="${SANS}" font-weight="600" font-size="${WM.size}" letter-spacing="${WM.ls}" fill="${t.text}">${WM_TEXT}</text><path fill="${t.signal}" d="${tittle(WM.tittleX, WM.tittleY, WM.tittleR)}"/></svg>`;
}
function raster16(t) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 64 64"><rect width="64" height="64" fill="${t.bg}"/>${eyeFrame({ ink: t.text, accent: t.signal })}</svg>`;
  return new Resvg(svg, ROPTS).render().asPng().toString('base64');
}
const panel = (x, y, w, h, t, label) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${t.bg}" stroke="${D['border-subtle']}"/>` +
  (label ? T(x + 24, y + 34, label.toUpperCase(), { size: 12, w: 500, fam: MONO, fill: t['text-muted'], ls: 1.4 }) : '');

// Badges
const SEV = [['critical', 'Critical', 4], ['high', 'High', 3], ['medium', 'Medium', 2], ['low', 'Low', 1]];
const STATUS = [['open', 'Open'], ['investigating', 'Investigating'], ['resolved', 'Resolved'], ['closed', 'Closed']];
function badge(x, y, t, name, key, label, level) {
  const c = t[key];
  const tint = mix(c, t.surface, TINT[name]);
  const tw = measure(label, SANS, level ? 600 : 500, 13);
  const w = 8 + 14 + 6 + tw + 8;
  let g = `<rect x="${x}" y="${y}" width="${w}" height="24" rx="4" fill="${tint}"/>`;
  const gx = x + 8, gy = y + 6;
  if (level) {
    for (let i = 0; i < 4; i++) g += `<rect x="${gx + i * 3.6}" y="${gy + 9 - i * 3}" width="2.4" height="${3 + i * 3}" rx="0.6" fill="${c}" opacity="${i < level ? 1 : 0.28}"/>`;
  } else {
    const cx = gx + 6, cy = y + 12;
    if (key.endsWith('open')) g += `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${c}" stroke-width="1.6"/>`;
    if (key.endsWith('investigating')) g += `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M${cx} ${cy - 4}a4 4 0 0 1 0 8Z" fill="${c}"/>`;
    if (key.endsWith('resolved')) g += `<path d="M${cx - 3.8} ${cy + 0.3}l2.6 2.5 5-5.4" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (key.endsWith('closed')) g += `<circle cx="${cx}" cy="${cy}" r="4.2" fill="${c}"/>`;
  }
  g += T(x + 28, y + 16.5, label, { size: 13, w: level ? 600 : 500, fill: c });
  return { w, svg: g };
}
function badgeRow(x, y, t, name, list, sev) {
  let out = '', cx = x;
  for (const item of list) {
    const b = sev ? badge(cx, y, t, name, `sev-${item[0]}`, item[1], item[2]) : badge(cx, y, t, name, `status-${item[0]}`, item[1]);
    out += b.svg; cx += b.w + 8;
  }
  return out;
}

const W = 1600, M = 64, CW = W - 2 * M, GAP = 16, PW = (CW - GAP) / 2;
let y = 0, body = '';
const chrome = D;
const head = (num, title, sub) => {
  body += T(M, y + 20, `${num} · ${title}`.toUpperCase(), { size: 13, w: 500, fam: MONO, fill: chrome.signal, ls: 1.6 });
  if (sub) body += T(M, y + 46, sub, { size: 16, fill: chrome['text-muted'] });
  y += sub ? 68 : 40;
};

// ---------- header ----------
y = 56;
const lk = lockupAt(M, y, 460, D);
body += lk.svg;
body += T(W - M, y + 30, 'BRAND BOARD · SIGN-OFF 2', { size: 13, w: 500, fam: MONO, fill: D.signal, ls: 1.6, anchor: 'end' });
body += T(W - M, y + 54, 'Logo C, Facet · 2026-11-25', { size: 13, fam: MONO, fill: D['text-muted'], anchor: 'end' });
body += T(W - M, y + 78, 'Live version with motion: docs/brand/board/index.html', { size: 13, fam: MONO, fill: D['text-muted'], anchor: 'end' });
y += lk.h + 28;
body += T(M, y, 'A watchtower at night: deep ink-blue, one ice-blue signal, sharp type and an eye that locks on.', { size: 20, fill: D['text-muted'] });
y += 40;
body += `<line x1="${M}" x2="${W - M}" y1="${y}" y2="${y}" stroke="${D['border-subtle']}"/>`;
y += 40;

// ---------- 01 mark ----------
head('01', 'The mark: Facet, refined', 'Kept as drawn; every horizontal edge on the 16 px grid, a wider slit, a slightly larger pupil.');
{
  const h = 300;
  for (const [i, name] of ['dark', 'light'].entries()) {
    const t = THEMES[name], x = M + i * (PW + GAP);
    body += panel(x, y, PW, h, t, name === 'dark' ? 'Night watch' : 'Daylight watch');
    body += eyeAt(x + 28, y + 60, 210, t);
    const sizes = [64, 32, 20, 16];
    let sx = x + 290; const mid = y + 165;
    for (const s of sizes) {
      body += eyeAt(sx, mid - s / 2, s, t);
      body += T(sx + s / 2, mid + 62, String(s), { size: 12, fam: MONO, fill: t['text-muted'], anchor: 'middle' });
      sx += s + 34;
    }
    body += `<image x="${sx}" y="${mid - 32}" width="64" height="64" image-rendering="optimizeSpeed" href="data:image/png;base64,${raster16(t)}"/>`;
    body += T(sx + 32, mid + 62, '16 ×4', { size: 12, fam: MONO, fill: t['text-muted'], anchor: 'middle' });
  }
  y += h + 48;
}

// ---------- 02 logo ----------
head('02', 'Wordmark and lockup', 'Space Grotesk 600 at -0.02em; the dot of the i is the pupil. Mark at 1.5x cap height, 0.32 em gap.');
{
  const h = 300;
  for (const [i, name] of ['dark', 'light'].entries()) {
    const t = THEMES[name], x = M + i * (PW + GAP);
    body += panel(x, y, PW, h, t, name === 'dark' ? 'Night watch' : 'Daylight watch');
    body += lockupAt(x + 28, y + 64, 420, t).svg;
    body += wordmarkAt(x + 28, y + 172, 250, t);
    body += lockupAt(x + 320, y + 180, 150, t).svg;
    // Browser tab with the real 16 px favicon
    const tx = x + 28, ty = y + 240;
    body += `<path d="M${tx} ${ty + 36}V${ty + 8}a8 8 0 0 1 8 -8H${tx + 172}a8 8 0 0 1 8 8V${ty + 36}Z" fill="${t['surface-raised']}" stroke="${t['border-subtle']}"/>`;
    body += eyeAt(tx + 12, ty + 10, 16, t);
    body += T(tx + 36, ty + 23, 'SentinelOps', { size: 12, w: 500, fill: t.text });
    body += T(tx + 160, ty + 23, '×', { size: 13, fill: t['text-muted'] });
    body += T(tx + 196, ty + 23, 'Browser tab, real 16 px', { size: 12, fam: MONO, fill: t['text-muted'] });
    if (name === 'dark') {
      body += `<rect x="${x + PW - 96}" y="${y + 196}" width="72" height="72" rx="16" fill="#0a1020" stroke="${D['border-subtle']}"/>`;
      body += eyeAt(x + PW - 84, y + 208, 48, D);
      body += T(x + PW - 60, y + 288, 'App icon', { size: 12, fam: MONO, fill: D['text-muted'], anchor: 'middle' });
    }
  }
  y += h + 48;
}

// ---------- 03 motion ----------
head('03', 'The eye in motion (frames)', 'Transform and opacity only. Each plays once in the app; reduced motion turns them into a 200 ms fade or nothing.');
{
  const rows = [
    ['Lock', 'Close 270 ms · tick 360 ms · open 360 ms', 'After sign-in succeeds', [
      ['0 ms', {}], ['150', { dy: 2 }], ['270', { dy: 4 }], ['450', { dy: 4, rot: 45, s: 1.14 }], ['630', { dy: 4, rot: 90 }], ['1200', {}]]],
    ['Wake', 'Lids part 560 ms · pupil 420 ms', 'The sign-in moment', [
      ['0 ms', { dy: 4, op: 0 }], ['200', { dy: 3, op: 0 }], ['400', { dy: 1.2, op: 0.35, s: 0.65, rot: -60 }], ['560', { dy: 0.3, op: 0.8, s: 0.88, rot: -20 }], ['760', { op: 1 }], ['1200', {}]]],
    ['Idle scan', '8 s loop · glide ease-in-out', 'Landing hero only', [
      ['0 s', {}], ['2', { dx: -4 }], ['4.5', { dx: 4 }], ['6.3', {}], ['6.6', { ping: 1.4, pingOp: 0.6 }], ['7.4', { ping: 2.4, pingOp: 0.2 }]]],
    ['Reduced motion', '200 ms opacity, no travel', 'Every eye animation', [
      ['0 ms', { all: 0.08 }], ['70', { all: 0.4 }], ['140', { all: 0.75 }], ['200', {}], ['', null], ['', null]]],
  ];
  const fw = 112, rowH = 150, half = PW;
  rows.forEach(([title, spec, use, frames], r) => {
    const col = r % 2, row = Math.floor(r / 2);
    const x = M + col * (PW + GAP), yy = y + row * (rowH + 64);
    body += T(x, yy + 18, title, { size: 20, w: 600, fill: chrome.text });
    body += T(x + measure(title, SANS, 600, 20) + 14, yy + 18, `${spec} · ${use}`, { size: 12, fam: MONO, fill: chrome['text-muted'] });
    const fy = yy + 34;
    body += `<rect x="${x}" y="${fy}" width="${half}" height="${rowH}" rx="14" fill="${D.bg}" stroke="${D['border-subtle']}"/>`;
    frames.forEach(([label, f], k) => {
      if (!f) return;
      const cx = x + 10 + k * (fw + 8);
      // alternate night and day tiles so both themes appear in every strip
      const t = k % 2 === 0 ? D : L;
      body += `<rect x="${cx}" y="${fy + 10}" width="${fw}" height="${rowH - 44}" rx="8" fill="${t.bg}"/>`;
      body += eyeAt(cx + 14, fy + 16, fw - 28, t, f);
      if (label) body += T(cx + fw / 2, fy + rowH - 13, label + (label.match(/ms|s$/) ? '' : ''), { size: 12, fam: MONO, fill: D['text-muted'], anchor: 'middle' });
    });
  });
  y += 2 * (rowH + 64) + 20;
}

// ---------- 04 palette ----------
head('04', 'Palette: night watch and daylight watch', 'One hue of ice blue at two depths: light at night, deep by day. Ratios are the worst case over bg, surface and raised.');
{
  const groups = ['bg', 'surface', 'surface-raised', 'border', 'border-subtle', 'text', 'text-muted', 'signal', 'signal-strong', 'on-signal', 'focus', 'danger',
    'sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'status-open', 'status-investigating', 'status-resolved', 'status-closed'];
  const cols = 3, cellW = (PW - 48) / cols, cellH = 58, h = 120 + Math.ceil(groups.length / cols) * cellH + 12;
  for (const [i, name] of ['dark', 'light'].entries()) {
    const t = THEMES[name], x = M + i * (PW + GAP);
    body += panel(x, y, PW, h, t, name === 'dark' ? 'Night watch (dark)' : 'Daylight watch (light)');
    // proportion strip
    const sx = x + 24, sy = y + 52, sw = PW - 48;
    const parts = [['bg', 0.6], ['surface', 0.2], ['surface-raised', 0.14], ['signal', 0.06]];
    let px = sx;
    body += `<clipPath id="strip${i}"><rect x="${sx}" y="${sy}" width="${sw}" height="44" rx="8"/></clipPath><g clip-path="url(#strip${i})">`;
    for (const [k, f] of parts) { body += `<rect x="${px}" y="${sy}" width="${sw * f + 1}" height="44" fill="${t[k]}"/>`; px += sw * f; }
    body += `</g><rect x="${sx}" y="${sy}" width="${sw}" height="44" rx="8" fill="none" stroke="${t['border-subtle']}"/>`;
    groups.forEach((k, j) => {
      const cx = x + 24 + (j % cols) * cellW, cy = y + 120 + Math.floor(j / cols) * cellH;
      body += `<rect x="${cx}" y="${cy}" width="36" height="36" rx="6" fill="${t[k]}" stroke="${mix(t.text, t.bg, 0.18)}" stroke-width="1"/>`;
      body += T(cx + 46, cy + 14, k, { size: 13, w: 500, fill: t.text });
      let note;
      if (['bg', 'surface', 'surface-raised'].includes(k)) note = '';
      else if (k === 'border-subtle') note = 'decorative';
      else if (k === 'on-signal') note = `${ratio(t[k], t.signal).toFixed(1)} on signal`;
      else note = `${Math.min(...['bg', 'surface', 'surface-raised'].map((s) => ratio(t[k], t[s]))).toFixed(1)}:1`;
      body += T(cx + 46, cy + 32, `${t[k]}${note ? '  ·  ' + note : ''}`, { size: 11.5, fam: MONO, fill: t['text-muted'] });
    });
  }
  y += h + 48;
}

// ---------- 05 type ----------
head('05', 'Type: Space Grotesk and JetBrains Mono', 'Grotesk for headings and interface; mono wherever a value must be read exactly. Nothing under 12 px, and 12 px only in mono.');
{
  const t = D;
  const rows = [
    ['Display', 'Space Grotesk 600 · 56/60 · -0.03em', 'Always watching.', { size: 56, w: 600, ls: -1.68 }, 84],
    ['H1', 'Space Grotesk 600 · 36/44 · -0.02em', 'Incidents', { size: 36, w: 600, ls: -0.72 }, 60],
    ['H2', 'Space Grotesk 600 · 24/32 · -0.01em', 'Needs attention', { size: 24, w: 600, ls: -0.24 }, 56],
    ['H3', 'Space Grotesk 600 · 18/26 · -0.005em', 'Elevated 5xx on the invoices API after the 14:02 deploy', { size: 18, w: 600, ls: -0.09 }, 52],
    ['Body L', 'Space Grotesk 400 · 18/28', 'Report, triage and resolve incidents in one place.', { size: 18, w: 400 }, 52],
    ['Body', 'Space Grotesk 400 · 16/24', 'Rollback started at 14:09. Error rate is back under 0.1% on two of three regions.', { size: 16, w: 400 }, 52],
    ['Small', 'Space Grotesk 500 · 14/20', 'Assigned to m.santos · Last updated 4 minutes ago', { size: 14, w: 500, fill: t['text-muted'] }, 52],
    ['Eyebrow', 'JetBrains Mono 500 · 12/16 · 0.12em · caps', 'AUDIT LOG · ANCHORED 6 H AGO', { size: 12, w: 500, fam: MONO, ls: 1.44, fill: t.signal }, 52],
    ['Data', 'JetBrains Mono 400 · 14/20 · tabular', 'INC-0142   3 open   1 critical   p95 412 ms', { size: 14, w: 400, fam: MONO }, 52],
    ['Data S', 'JetBrains Mono 500 · 12/16 · 0.02em', '2026-11-25 14:07:33 UTC', { size: 12, w: 500, fam: MONO, ls: 0.24, fill: t['text-muted'] }, 52],
  ];
  const h = 40 + rows.reduce((a, r) => a + r[4], 0) + 16;
  const typeW = 960;
  body += panel(M, y, typeW, h, t, 'Scale');
  let ry = y + 56;
  for (const [label, spec, sample, st, rh] of rows) {
    body += `<line x1="${M + 24}" x2="${M + typeW - 24}" y1="${ry}" y2="${ry}" stroke="${t['border-subtle']}"/>`;
    body += T(M + 24, ry + 22, label, { size: 13, w: 600, fam: MONO, fill: t.text });
    body += T(M + 24, ry + 38, spec, { size: 11.5, fam: MONO, fill: t['text-muted'] });
    const base = ry + Math.min(rh - 14, st.size + 10);
    body += T(M + 330, base, sample, { fill: t.text, ...st });
    ry += rh;
  }
  // in-context specimen, both themes, stacked to the right
  const cx = M + typeW + GAP, cw = CW - typeW - GAP, ch = (h - GAP) / 2;
  for (const [i, name] of ['dark', 'light'].entries()) {
    const tt = THEMES[name], yy = y + i * (ch + GAP);
    body += panel(cx, yy, cw, ch, tt, `In context · ${name === 'dark' ? 'night' : 'day'}`);
    body += T(cx + 24, yy + 76, 'INCIDENT · INC-0142', { size: 12, w: 500, fam: MONO, ls: 1.44, fill: tt.signal });
    body += T(cx + 24, yy + 106, 'Elevated 5xx on the invoices API', { size: 24, w: 600, ls: -0.24, fill: tt.text });
    body += T(cx + 24, yy + 138, 'after the 14:02 deploy', { size: 24, w: 600, ls: -0.24, fill: tt.text });
    body += badgeRow(cx + 24, yy + 160, tt, name, [SEV[0]], true);
    body += badgeRow(cx + 112, yy + 160, tt, name, [STATUS[1]], false);
    body += T(cx + 270, yy + 177, '2026-11-25 14:07:33 UTC', { size: 12, w: 500, fam: MONO, ls: 0.24, fill: tt['text-muted'] });
    body += T(cx + 24, yy + 220, 'Rollback started at 14:09. Error rate is falling.', { size: 16, fill: tt.text });
  }
  y += h + 48;
}

// ---------- 06 components ----------
head('06', 'Components', 'Small radii echo the sharp mark. Severity reads by bars as well as colour; status by a glyph.');
{
  const h = 396;
  for (const [i, name] of ['dark', 'light'].entries()) {
    const t = THEMES[name], x = M + i * (PW + GAP);
    body += panel(x, y, PW, h, t, name === 'dark' ? 'Night watch' : 'Daylight watch');
    let yy = y + 56;
    // buttons
    const b1 = measure('Sign in', SANS, 600, 14) + 32, b2 = measure('Have an invite?', SANS, 600, 14) + 32;
    body += `<rect x="${x + 24}" y="${yy}" width="${b1}" height="40" rx="4" fill="${t.signal}"/>` + T(x + 40, yy + 25, 'Sign in', { size: 14, w: 600, fill: t['on-signal'] });
    body += `<rect x="${x + 34 + b1}" y="${yy + 0.5}" width="${b2}" height="39" rx="4" fill="none" stroke="${t.border}"/>` + T(x + 50 + b1, yy + 25, 'Have an invite?', { size: 14, w: 600, fill: t.text });
    // inputs
    body += T(x + 24 + b1 + b2 + 40, yy + 2, 'Password', { size: 14, w: 500, fill: t.text });
    const ix = x + 24 + b1 + b2 + 40, iy = yy + 14;
    const fw = PW - (ix - x) - 28;
    body += `<rect x="${ix - 4}" y="${iy - 4}" width="${fw + 8}" height="48" rx="7" fill="none" stroke="${t.focus}" stroke-width="2"/>`;
    body += `<rect x="${ix}" y="${iy}" width="${fw}" height="40" rx="4" fill="${t.surface}" stroke="${t.signal}"/>`;
    body += T(ix + 12, iy + 26, '••••••••••••••', { size: 16, fill: t.text });
    body += T(ix, iy + 64, 'Focused: 2 px ring, 2 px offset', { size: 11.5, fam: MONO, fill: t['text-muted'] });
    yy += 112;
    body += badgeRow(x + 24, yy, t, name, SEV, true);
    body += badgeRow(x + 24, yy + 36, t, name, STATUS, false);
    yy += 84;
    // card
    const cw = PW - 48;
    body += `<rect x="${x + 24}" y="${yy}" width="${cw}" height="112" rx="8" fill="${t.surface}" stroke="${t['border-subtle']}"/>`;
    body += T(x + 42, yy + 28, 'INC-0142', { size: 13, w: 500, fam: MONO, fill: t.signal });
    body += T(x + 24 + cw - 18, yy + 28, '2026-11-25 14:07:33 UTC', { size: 12, w: 500, fam: MONO, ls: 0.24, fill: t['text-muted'], anchor: 'end' });
    body += T(x + 42, yy + 58, 'Elevated 5xx on the invoices API after the 14:02 deploy', { size: 18, w: 600, ls: -0.09, fill: t.text });
    body += badgeRow(x + 42, yy + 72, t, name, [SEV[0]], true);
    body += badgeRow(x + 130, yy + 72, t, name, [STATUS[1]], false);
    body += T(x + 270, yy + 89, 'Assigned to', { size: 14, fill: t['text-muted'] });
    body += T(x + 270 + measure('Assigned to', SANS, 400, 14) + 6, yy + 89, 'm.santos', { size: 13, fam: MONO, fill: t.text });
  }
  y += h + 40;
}
body += T(M, y, 'SentinelOps brand board · proposed values: docs/brand/board/proposed-tokens.md · contrast tables: index.html section 07', { size: 12, fam: MONO, fill: D['text-muted'] });
y += 40;

y = Math.ceil(y);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#070c18"/>${body}</svg>`;
writeFileSync(`${OUT}/board.png`, new Resvg(svg, ROPTS).render().asPng());
console.log(`board.png ${W}x${y}`);
