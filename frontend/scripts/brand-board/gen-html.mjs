// Writes docs/brand/board/index.html and facet-mark.svg from palette.mjs and eye.mjs.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { brandFontFiles } from './woff2ttf.mjs';
import { THEMES, ratio, mix, TINT } from './palette.mjs';
import { UP, DOWN, PUPIL, UNIVERSAL_ACCENT, WM, WM_TEXT, tittle, LOCK, eyeFrame } from './eye.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'brand', 'board');
mkdirSync(OUT, { recursive: true });

// ---------- facet-mark.svg ----------
const markFile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <path fill="currentColor" d="${UP}"/>
  <path fill="currentColor" d="${DOWN}"/>
  <path class="pupil" fill="${UNIVERSAL_ACCENT}" d="${PUPIL}"/>
</svg>
`;
writeFileSync(`${OUT}/facet-mark.svg`, markFile);

// ---------- helpers ----------
const ORDER = ['bg', 'surface', 'surface-raised', 'border', 'border-subtle', 'text', 'text-muted', 'signal', 'signal-strong', 'on-signal', 'focus', 'danger',
  'sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'status-open', 'status-investigating', 'status-resolved', 'status-closed'];
const vars = (t, name) => ORDER.map((k) => `--color-${k}: ${t[k]};`).join(' ') + ` --tint: ${Math.round(TINT[name] * 100)}%;`;

const eye = (cls = '') => `<svg class="eye ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="ping" d="${PUPIL}"/><g class="lid lid-up"><path d="${UP}"/></g><g class="lid lid-down"><path d="${DOWN}"/></g><g class="look"><path class="pupil" d="${PUPIL}"/></g></svg>`;

const wordText = `<text x="0" y="${WM.baseline}" font-size="${WM.size}" letter-spacing="${WM.ls}" class="wm-text">${WM_TEXT}</text>`;
const wordmark = (label = true) =>
  `<svg class="wordmark" viewBox="0 118 ${WM.width} 108" ${label ? 'role="img" aria-label="SentinelOps"' : 'aria-hidden="true"'}>${wordText}<path class="pupil" d="${tittle(WM.tittleX, WM.tittleY, WM.tittleR)}"/></svg>`;
const lockup = (cls = '', label = 'SentinelOps') =>
  `<svg class="lockup ${cls}" viewBox="${LOCK.viewBox}" role="img" aria-label="${label}"><g transform="translate(0 ${LOCK.markTop}) scale(${LOCK.scale})" class="eye-g"><path class="ping" d="${PUPIL}"/><g class="lid lid-up"><path d="${UP}"/></g><g class="lid lid-down"><path d="${DOWN}"/></g><g class="look"><path class="pupil" d="${PUPIL}"/></g></g><g transform="translate(${LOCK.textX} 0)">${wordText}<path class="pupil" d="${tittle(WM.tittleX, WM.tittleY, WM.tittleR)}"/></g></svg>`;

// True 16 px renders, magnified on the page pixel for pixel.
const fontFiles = brandFontFiles();
export function raster16(themeName) {
  const t = THEMES[themeName];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 64 64"><rect width="64" height="64" fill="${t.bg}"/>${eyeFrame({ ink: t.text, accent: t.signal })}</svg>`;
  return new Resvg(svg, { font: { fontFiles, loadSystemFonts: false } }).render().asPng();
}
const png16 = { dark: raster16('dark').toString('base64'), light: raster16('light').toString('base64') };

const SEV = [['critical', 'Critical', 4], ['high', 'High', 3], ['medium', 'Medium', 2], ['low', 'Low', 1]];
const STATUS = [['open', 'Open'], ['investigating', 'Investigating'], ['resolved', 'Resolved'], ['closed', 'Closed']];
const bars = (n) => `<svg class="bars" viewBox="0 0 14 12" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<rect x="${i * 3.6}" y="${9 - i * 3}" width="2.4" height="${3 + i * 3}" rx="0.6" ${i < n ? '' : 'class="off"'}/>`).join('')}</svg>`;
const glyph = {
  open: '<svg class="g" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  investigating: '<svg class="g" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 2a4 4 0 0 1 0 8Z" fill="currentColor"/></svg>',
  resolved: '<svg class="g" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.3 4.8 8.8 9.8 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  closed: '<svg class="g" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="currentColor"/></svg>',
};
const sevBadge = ([k, label, n]) => `<span class="badge sev" style="--c: var(--color-sev-${k})">${bars(n)}${label}</span>`;
const statusBadge = ([k, label]) => `<span class="badge status" style="--c: var(--color-status-${k})">${glyph[k]}${label}</span>`;

const GROUPS = [
  ['Surfaces', [['bg', 'ui'], ['surface', 'ui'], ['surface-raised', 'ui'], ['border', 'ui'], ['border-subtle', 'deco']]],
  ['Text', [['text', 'text'], ['text-muted', 'text']]],
  ['Signal', [['signal', 'text'], ['signal-strong', 'text'], ['on-signal', 'on'], ['focus', 'ui']]],
  ['Severity', [['sev-critical', 'text'], ['sev-high', 'text'], ['sev-medium', 'text'], ['sev-low', 'text']]],
  ['Status', [['status-open', 'text'], ['status-investigating', 'text'], ['status-resolved', 'text'], ['status-closed', 'text']]],
  ['Danger', [['danger', 'text']]],
];
function swatches(name) {
  const t = THEMES[name];
  return GROUPS.map(([g, list]) => `<div class="sw-group"><h4>${g}</h4><ul>${list.map(([k, kind]) => {
    let note = '';
    if (kind === 'text' || kind === 'ui') {
      const worst = Math.min(...['bg', 'surface', 'surface-raised'].map((s) => ratio(t[k], t[s])));
      note = k === 'bg' || k === 'surface' || k === 'surface-raised' ? '' : `${worst.toFixed(1)}:1`;
    } else if (kind === 'on') note = `${ratio(t[k], t.signal).toFixed(1)}:1 on signal`;
    else note = 'decorative';
    return `<li><span class="chip" style="background:${t[k]}"></span><span class="sw-name">${k}</span><span class="sw-hex">${t[k]}</span><span class="sw-ratio">${note}</span></li>`;
  }).join('')}</ul></div>`).join('');
}

function contrastTable(name) {
  const t = THEMES[name];
  const fgs = ['text', 'text-muted', 'signal', 'signal-strong', 'danger', 'border', 'focus',
    'sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'status-open', 'status-investigating', 'status-resolved', 'status-closed'];
  const need = (k) => (k === 'border' || k === 'focus' ? 3 : 4.5);
  const cell = (r, n) => `<td class="${r >= n ? 'ok' : 'bad'}">${r.toFixed(2)}</td>`;
  let body = fgs.map((k) => {
    const n = need(k);
    const badge = k.startsWith('sev') || k.startsWith('status') ? cell(ratio(t[k], mix(t[k], t.surface, TINT[name])), n) : '<td class="na">&ndash;</td>';
    return `<tr><th scope="row">${k}</th>${['bg', 'surface', 'surface-raised'].map((s) => cell(ratio(t[k], t[s]), n)).join('')}${badge}<td>${n}</td></tr>`;
  }).join('');
  body += `<tr><th scope="row">on-signal / signal</th><td colspan="3" class="ok">${ratio(t['on-signal'], t.signal).toFixed(2)} (button text)</td><td class="na">&ndash;</td><td>4.5</td></tr>`;
  body += `<tr><th scope="row">on-signal / signal-strong</th><td colspan="3" class="ok">${ratio(t['on-signal'], t['signal-strong']).toFixed(2)} (hover)</td><td class="na">&ndash;</td><td>4.5</td></tr>`;
  return `<table><caption>${name === 'dark' ? 'Night watch (dark)' : 'Daylight watch (light)'}</caption><thead><tr><th scope="col">Foreground</th><th scope="col">bg</th><th scope="col">surface</th><th scope="col">raised</th><th scope="col">badge tint</th><th scope="col">needs</th></tr></thead><tbody>${body}</tbody></table>`;
}

function components(name) {
  return `<div class="cmp t-${name}">
  <p class="cmp-label">${name === 'dark' ? 'Night watch' : 'Daylight watch'}</p>
  <div class="cmp-row"><button class="btn btn-primary" type="button">Sign in</button><button class="btn btn-secondary" type="button">Have an invite?</button></div>
  <div class="fields">
    <label class="field"><span>Email</span><input type="email" placeholder="name@example.com" tabindex="-1"></label>
    <label class="field is-focus"><span>Password</span><input type="password" value="watchtower-at-night" tabindex="-1"><small>Focused: 2 px ring, 2 px offset</small></label>
  </div>
  <div class="cmp-row">${SEV.map(sevBadge).join('')}</div>
  <div class="cmp-row">${STATUS.map(statusBadge).join('')}</div>
  <article class="card">
    <div class="card-top"><span class="mono id">INC-0142</span><time class="mono ts">2026-11-25 14:07:33 UTC</time></div>
    <h3>Elevated 5xx on the invoices API after the 14:02 deploy</h3>
    <div class="card-meta">${sevBadge(SEV[0])}${statusBadge(STATUS[1])}<span class="who">Assigned to <span class="mono">m.santos</span></span></div>
  </article>
</div>`;
}

const TYPE = [
  ['Display', 'display', 'Something is always watching.', 'Space Grotesk 600 · 56/60 (40/44 under 640 px) · -0.03em', 'Landing hero only'],
  ['H1', 'h1', 'Incidents', 'Space Grotesk 600 · 36/44 · -0.02em', 'Page titles'],
  ['H2', 'h2', 'Needs attention', 'Space Grotesk 600 · 24/32 · -0.01em', 'Section titles'],
  ['H3', 'h3', 'Elevated 5xx on the invoices API after the 14:02 deploy', 'Space Grotesk 600 · 18/26 · -0.005em', 'Card and dialog titles'],
  ['Body L', 'body-l', 'Report, triage and resolve incidents in one place, with every change written to a tamper-evident audit log.', 'Space Grotesk 400 · 18/28 · 0', 'Landing copy'],
  ['Body', 'body', 'Rollback started at 14:09. Error rate is back under 0.1% on two of three regions.', 'Space Grotesk 400 · 16/24 · 0', 'Interface text'],
  ['Small', 'small', 'Assigned to m.santos · Last updated 4 minutes ago', 'Space Grotesk 500 · 14/20 · 0.005em', 'Labels, buttons, help'],
  ['Eyebrow', 'eyebrow', 'AUDIT LOG · ANCHORED 6 H AGO', 'JetBrains Mono 500 · 12/16 · 0.12em · uppercase', 'Section labels'],
  ['Data', 'data', 'INC-0142   3 open   1 critical   p95 412 ms', 'JetBrains Mono 400 · 14/20 · 0 · tabular', 'IDs, counts, figures'],
  ['Data S', 'data-s', '2026-11-25 14:07:33 UTC', 'JetBrains Mono 500 · 12/16 · 0.02em', 'Timestamps'],
];

const motionTiles = [
  ['lock', 'Lock', 'The lids close onto the pupil like a shutter, the diamond ticks a quarter turn, the lids part. Says "secured": after sign-in succeeds, when a session is verified.', 'Close 270 ms ease-in-out · tick 360 ms ease-out · open 360 ms ease-out'],
  ['wake', 'Wake', 'The eye starts shut, the lids part and the pupil ignites, turning into place. The sign-in moment, once on load.', 'Part 560 ms ease-out · pupil 420 ms ease-out, 220 ms after'],
  ['idle', 'Idle scan', 'The pupil checks left and right, then sends one quiet ping. Landing hero only, never on working screens.', '8 s loop · glide ease-in-out · ping 1.6 s ease-out'],
  ['reduced', 'Reduced motion', 'With reduce motion on: no travel, no turn. Lock and wake become a 200 ms fade; the idle scan does not run.', '200 ms linear opacity, or nothing'],
];

const css = `
:root { color-scheme: light; ${vars(THEMES.light, 'light')} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${vars(THEMES.dark, 'dark')} } }
:root[data-theme="dark"] { color-scheme: dark; ${vars(THEMES.dark, 'dark')} }
.t-dark { color-scheme: dark; ${vars(THEMES.dark, 'dark')} }
.t-light { color-scheme: light; ${vars(THEMES.light, 'light')} }
.t-dark, .t-light { background: var(--color-bg); color: var(--color-text); }

:root {
  --font-sans: 'Space Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --gutter: 16px;
}
@media (min-width: 720px) { :root { --gutter: 40px; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--color-bg); color: var(--color-text); font: 400 16px/24px var(--font-sans); }
.wrap { max-width: 1280px; margin: 0 auto; padding: 0 var(--gutter); }
.mono { font-family: var(--font-mono); }
h1, h2, h3, h4, p { margin: 0; }

/* Header */
.top { padding: 56px 0 40px; border-bottom: 1px solid var(--color-border-subtle); }
.top .lockup { width: min(440px, 100%); height: auto; display: block; color: var(--color-text); }
.top-meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 28px; font: 500 12px/16px var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }
.top-meta b { color: var(--color-signal); font-weight: 500; }
.lede { max-width: 62ch; margin-top: 20px; font-size: 18px; line-height: 28px; color: var(--color-text-muted); }

/* Sections */
section { padding: 56px 0; border-bottom: 1px solid var(--color-border-subtle); }
.sec-head { display: grid; gap: 8px; margin-bottom: 28px; max-width: 70ch; }
.eyebrow { font: 500 12px/16px var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-signal); }
.sec-head h2 { font-size: 28px; line-height: 36px; font-weight: 600; letter-spacing: -0.015em; }
.sec-head p { color: var(--color-text-muted); }
.pair { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .pair { grid-template-columns: 1fr 1fr; } }
.panel { border-radius: 14px; padding: 24px; border: 1px solid var(--color-border-subtle); min-width: 0; }
.panel-label { font: 500 12px/16px var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 20px; }

/* Eye */
.eye, .eye-g { fill: currentColor; }
.pupil { fill: var(--color-signal); }
.ping { fill: none; stroke: var(--color-signal); stroke-width: 1.5; vector-effect: non-scaling-stroke; opacity: 0; }
.pupil, .ping, .look { transform-box: fill-box; transform-origin: center; }
.wm-text { font-family: var(--font-sans); font-weight: 600; fill: currentColor; }

/* 01 mark */
.mark-stage { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: center; }
@media (min-width: 560px) { .mark-stage { grid-template-columns: minmax(0, 220px) minmax(0, 1fr); } }
.mark-stage .eye { width: 100%; max-width: 220px; height: auto; display: block; }
.sizes { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; }
.sizes figure { margin: 0; display: grid; justify-items: center; gap: 8px; }
.sizes figcaption { font: 500 12px/16px var(--font-mono); color: var(--color-text-muted); }
.px { image-rendering: pixelated; width: 64px; height: 64px; display: block; border-radius: 2px; }
.anatomy { display: grid; gap: 12px; margin-top: 24px; grid-template-columns: 1fr; }
@media (min-width: 720px) { .anatomy { grid-template-columns: repeat(4, 1fr); } }
.anatomy div { border-top: 1px solid var(--color-border-subtle); padding-top: 12px; }
.anatomy b { display: block; font-weight: 600; margin-bottom: 4px; }
.anatomy p { color: var(--color-text-muted); font-size: 14px; line-height: 20px; }

/* 02 wordmark + lockup */
.logo-panel { display: grid; gap: 28px; }
.logo-panel .lockup { width: min(360px, 100%); height: auto; display: block; }
.logo-panel .wordmark { width: min(260px, 100%); height: auto; display: block; }
.logo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 20px 28px; }
.logo-panel .lockup.small-lockup { width: 132px; height: auto; display: block; }
.tab { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 8px 8px 0 0; background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle); border-bottom: 0; font-size: 12px; max-width: 100%; }
.tab .eye { width: 16px; height: 16px; flex: none; }
.tab .x { color: var(--color-text-muted); margin-left: 12px; }
.app-icon { flex: none; width: 64px; height: 64px; border-radius: 14px; background: #0a1020; box-shadow: inset 0 0 0 1px #223050; color: #e6edf8; display: grid; place-items: center; --color-signal: ${THEMES.dark.signal}; }
.app-icon .eye { width: 44px; height: 44px; }
.cap { font: 500 12px/16px var(--font-mono); color: var(--color-text-muted); }

/* 03 motion */
.motion-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 640px) { .motion-grid { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1100px) { .motion-grid { grid-template-columns: repeat(4, 1fr); } }
.tile { border-radius: 14px; border: 1px solid var(--color-border-subtle); overflow: hidden; display: grid; grid-template-rows: auto 1fr; min-width: 0; }
.tile-stage { display: grid; grid-template-columns: 1fr 1fr; }
.tile-stage > div { display: grid; place-items: center; padding: 28px 12px; }
.tile-stage .eye { width: 100%; max-width: 112px; height: auto; }
.tile-text { padding: 16px 18px 20px; display: grid; gap: 8px; align-content: start; }
.tile-text h3 { font-size: 18px; line-height: 26px; font-weight: 600; }
.tile-text p { font-size: 14px; line-height: 20px; color: var(--color-text-muted); }
.tile-text .spec { font: 400 12px/16px var(--font-mono); color: var(--color-text-muted); }

.lock .lid-up { animation: lock-up 3s infinite; }
.lock .lid-down { animation: lock-down 3s infinite; }
.lock .pupil { animation: lock-tick 3s infinite; }
@keyframes lock-up { 0%, 10% { transform: translateY(0); animation-timing-function: var(--ease-in-out); } 19%, 40% { transform: translateY(4px); animation-timing-function: var(--ease-out); } 52%, 100% { transform: translateY(0); } }
@keyframes lock-down { 0%, 10% { transform: translateY(0); animation-timing-function: var(--ease-in-out); } 19%, 40% { transform: translateY(-4px); animation-timing-function: var(--ease-out); } 52%, 100% { transform: translateY(0); } }
@keyframes lock-tick { 0%, 21% { transform: rotate(0) scale(1); animation-timing-function: var(--ease-out); } 27% { transform: rotate(60deg) scale(1.14); animation-timing-function: var(--ease-out); } 33%, 100% { transform: rotate(90deg) scale(1); } }

.wake { animation: wake-fade 4.2s infinite; }
.wake .lid-up { animation: wake-up 4.2s infinite; }
.wake .lid-down { animation: wake-down 4.2s infinite; }
.wake .pupil { animation: wake-pupil 4.2s infinite; }
@keyframes wake-fade { 0%, 86% { opacity: 1; } 91%, 95% { opacity: 0; } 100% { opacity: 1; } }
@keyframes wake-up { 0%, 8% { transform: translateY(4px); animation-timing-function: var(--ease-out); } 21%, 92% { transform: translateY(0); } 93%, 100% { transform: translateY(4px); } }
@keyframes wake-down { 0%, 8% { transform: translateY(-4px); animation-timing-function: var(--ease-out); } 21%, 92% { transform: translateY(0); } 93%, 100% { transform: translateY(-4px); } }
@keyframes wake-pupil { 0%, 13% { opacity: 0; transform: rotate(-90deg) scale(0.5); animation-timing-function: var(--ease-out); } 23%, 92% { opacity: 1; transform: rotate(0) scale(1); } 93%, 100% { opacity: 0; transform: rotate(-90deg) scale(0.5); } }

.idle .look { animation: idle-look 8s infinite var(--ease-in-out); }
.idle .ping { animation: idle-ping 8s infinite; }
@keyframes idle-look { 0%, 10% { transform: translateX(0); } 22%, 34% { transform: translateX(-4px); } 52%, 62% { transform: translateX(4px); } 76%, 100% { transform: translateX(0); } }
@keyframes idle-ping { 0%, 78% { opacity: 0; transform: scale(1); } 79% { opacity: 0.7; transform: scale(1); animation-timing-function: var(--ease-out); } 99% { opacity: 0; transform: scale(2.8); } 100% { opacity: 0; transform: scale(1); } }

.reduced { animation: rm-fade 3s infinite linear; }
@keyframes rm-fade { 0% { opacity: 0; } 6.7%, 100% { opacity: 1; } }

/* The header lockup wakes once on load. */
.wake-once .lid-up { animation: once-up 560ms var(--ease-out) 200ms both; }
.wake-once .lid-down { animation: once-down 560ms var(--ease-out) 200ms both; }
.wake-once .look .pupil { animation: once-pupil 420ms var(--ease-out) 420ms both; }
@keyframes once-up { from { transform: translateY(4px); } to { transform: translateY(0); } }
@keyframes once-down { from { transform: translateY(-4px); } to { transform: translateY(0); } }
@keyframes once-pupil { from { opacity: 0; transform: rotate(-90deg) scale(0.5); } to { opacity: 1; transform: rotate(0) scale(1); } }

@media (prefers-reduced-motion: reduce) {
  .lock *, .wake, .wake *, .idle *, .wake-once *, .reduced { animation: none !important; }
}

/* 04 palette */
.sw-group { margin-bottom: 20px; }
.sw-group h4 { font: 500 12px/16px var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; }
.sw-group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sw-group li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; grid-template-areas: "chip name hex" "chip ratio ratio"; column-gap: 12px; align-items: center; }
@media (min-width: 480px) { .sw-group li { grid-template-columns: 28px minmax(0, 1fr) 76px 108px; grid-template-areas: "chip name hex ratio"; } }
.chip { grid-area: chip; width: 28px; height: 28px; border-radius: 6px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text) 18%, transparent); }
.sw-name { grid-area: name; font-size: 14px; overflow-wrap: anywhere; }
.sw-hex { grid-area: hex; font: 400 13px/20px var(--font-mono); }
.sw-ratio { grid-area: ratio; font: 400 12px/16px var(--font-mono); color: var(--color-text-muted); }
@media (min-width: 480px) { .sw-ratio { text-align: right; } }
.callout { margin-top: 24px; border: 1px solid var(--color-border-subtle); border-radius: 14px; padding: 20px 24px; display: grid; gap: 16px; }
@media (min-width: 900px) { .callout { grid-template-columns: 1fr 1fr 1fr; } }
.callout h3 { font-size: 18px; line-height: 26px; }
.callout p { font-size: 14px; line-height: 20px; color: var(--color-text-muted); margin-top: 4px; }
.ice { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.ice span { font: 500 12px/16px var(--font-mono); padding: 6px 10px; border-radius: 4px; }

/* 05 type */
.type-list { display: grid; }
.type-row { display: grid; grid-template-columns: 1fr; gap: 6px 24px; padding: 18px 0; border-top: 1px solid var(--color-border-subtle); }
@media (min-width: 900px) { .type-row { grid-template-columns: 300px minmax(0, 1fr); align-items: start; } }
.type-row .meta { padding-top: 4px; }
.strip { display: grid; grid-template-columns: 6fr 2fr 1.4fr 0.6fr; height: 56px; border-radius: 8px; overflow: hidden; margin-bottom: 24px; box-shadow: inset 0 0 0 1px var(--color-border-subtle); }
.strip span { display: block; }
.ctx { display: grid; gap: 10px; }
.ctx .h1 { font-size: 28px; line-height: 36px; }
@media (min-width: 640px) { .ctx .h1 { font-size: 36px; line-height: 44px; } }
.ctx-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
.type-row .meta { font: 400 12px/16px var(--font-mono); color: var(--color-text-muted); display: grid; gap: 2px; }
.type-row .meta b { font-weight: 600; color: var(--color-text); }
.sample { min-width: 0; overflow-wrap: anywhere; }
.display { font-size: 40px; line-height: 44px; font-weight: 600; letter-spacing: -0.03em; }
@media (min-width: 640px) { .display { font-size: 56px; line-height: 60px; } }
.h1 { font-size: 36px; line-height: 44px; font-weight: 600; letter-spacing: -0.02em; }
.h2 { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; }
.h3 { font-size: 18px; line-height: 26px; font-weight: 600; letter-spacing: -0.005em; }
.body-l { font-size: 18px; line-height: 28px; max-width: 60ch; }
.body { font-size: 16px; line-height: 24px; max-width: 60ch; }
.small { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: 0.005em; color: var(--color-text-muted); }
.eyebrow-s { font: 500 12px/16px var(--font-mono); letter-spacing: 0.12em; color: var(--color-signal); }
.data { font: 400 14px/20px var(--font-mono); font-variant-numeric: tabular-nums; white-space: pre-wrap; }
.data-s { font: 500 12px/16px var(--font-mono); letter-spacing: 0.02em; color: var(--color-text-muted); }

/* 06 components */
.cmp { border-radius: 14px; padding: 24px; display: grid; gap: 20px; border: 1px solid var(--color-border-subtle); min-width: 0; }
.cmp-label { font: 500 12px/16px var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }
.cmp-row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.btn { font: 600 14px/20px var(--font-sans); letter-spacing: 0.005em; height: 40px; padding: 0 16px; border-radius: 4px; cursor: pointer; transition: transform 160ms var(--ease-out), background-color 160ms ease; }
.btn:active { transform: scale(0.97); }
.btn-primary { background: var(--color-signal); color: var(--color-on-signal); border: 0; }
@media (hover: hover) and (pointer: fine) { .btn-primary:hover { background: var(--color-signal-strong); } .btn-secondary:hover { background: var(--color-surface-raised); } }
.btn-secondary { background: transparent; color: var(--color-text); border: 1px solid var(--color-border); }
.btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.fields { display: grid; gap: 14px; grid-template-columns: 1fr; }
@media (min-width: 520px) { .fields { grid-template-columns: 1fr 1fr; } }
.field { display: grid; align-content: start; gap: 6px; font-size: 14px; line-height: 20px; font-weight: 500; min-width: 0; }
.field input { font: 400 16px/24px var(--font-sans); height: 40px; padding: 0 12px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); width: 100%; min-width: 0; }
.field input::placeholder { color: var(--color-text-muted); opacity: 1; }
.field small { font: 400 12px/16px var(--font-mono); color: var(--color-text-muted); }
.field.is-focus input, .field input:focus-visible { border-color: var(--color-signal); outline: 2px solid var(--color-focus); outline-offset: 2px; }
.badge { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: 4px; font: 600 13px/16px var(--font-sans); color: var(--c); background: color-mix(in srgb, var(--c) var(--tint), var(--color-surface)); white-space: nowrap; }
.badge .bars { width: 14px; height: 12px; fill: currentColor; }
.badge .bars .off { opacity: 0.28; }
.badge .g { width: 12px; height: 12px; }
.badge.status { font-weight: 500; }
.card { background: var(--color-surface); border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 16px 18px; display: grid; gap: 10px; box-shadow: 0 1px 0 color-mix(in srgb, var(--color-text) 4%, transparent), 0 12px 24px -12px rgb(0 0 0 / 0.35); }
.t-light .card { box-shadow: 0 1px 2px rgb(11 20 38 / 0.06), 0 12px 24px -12px rgb(11 20 38 / 0.18); }
.card-top { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; }
.card .id { font: 500 13px/20px var(--font-mono); color: var(--color-signal); }
.card .ts { font: 500 12px/20px var(--font-mono); letter-spacing: 0.02em; color: var(--color-text-muted); }
.card h3 { font-size: 18px; line-height: 26px; font-weight: 600; letter-spacing: -0.005em; }
.card-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.who { font-size: 14px; line-height: 20px; color: var(--color-text-muted); }
.who .mono { font-size: 13px; color: var(--color-text); }

/* 07 contrast */
details { border: 1px solid var(--color-border-subtle); border-radius: 14px; padding: 16px 20px; }
summary { cursor: pointer; font-weight: 600; }
summary:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 4px; border-radius: 4px; }
.tables { display: grid; gap: 24px; margin-top: 16px; }
@media (min-width: 1000px) { .tables { grid-template-columns: 1fr 1fr; } }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font: 400 12px/16px var(--font-mono); }
caption { text-align: left; font: 600 14px/20px var(--font-sans); padding-bottom: 8px; }
th, td { padding: 6px 8px; border-bottom: 1px solid var(--color-border-subtle); text-align: right; white-space: nowrap; }
th[scope="row"], thead th:first-child { text-align: left; font-weight: 500; }
td.ok::after { content: " \\2713"; color: var(--color-status-resolved); }
td.bad { color: var(--color-danger); font-weight: 600; }
td.na { color: var(--color-text-muted); }
footer { padding: 32px 0 56px; font: 400 12px/16px var(--font-mono); color: var(--color-text-muted); }
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SentinelOps Brand Board</title>
<meta name="description" content="The SentinelOps brand board for sign-off: palette in both themes, type, the Facet logo system and the eye in motion.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap">
<style>${css}</style>
</head>
<body>
<header class="top"><div class="wrap">
  ${lockup('wake-once')}
  <div class="top-meta"><span>Brand board</span><span><b>Sign-off 2</b></span><span>Logo: C, Facet</span><span>2026-11-25</span></div>
  <p class="lede">A watchtower at night: deep ink-blue, one ice-blue signal, sharp type and an eye that locks on. Everything below is shown in both themes. Nothing here ships yet; once approved, the values in section 04 go into the app.</p>
</div></header>

<main>
<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">01 · The mark</span><h2>Facet, refined</h2><p>Your pick, kept as drawn: two chevron lids and a diamond pupil. The changes are about precision. Every horizontal edge now sits on the 16 px pixel grid, the slit between the lids is a little wider, and the pupil is a little larger, so the eye still reads at favicon size.</p></div>
  <div class="pair">${['dark', 'light'].map((n) => `
    <div class="panel t-${n}"><p class="panel-label">${n === 'dark' ? 'Night watch' : 'Daylight watch'}</p>
      <div class="mark-stage">${eye()}
        <div class="sizes">
          <figure><svg class="eye" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="${UP}"/><path d="${DOWN}"/><path class="pupil" d="${PUPIL}"/></svg><figcaption>64</figcaption></figure>
          <figure><svg class="eye" viewBox="0 0 64 64" width="32" height="32" aria-hidden="true"><path d="${UP}"/><path d="${DOWN}"/><path class="pupil" d="${PUPIL}"/></svg><figcaption>32</figcaption></figure>
          <figure><svg class="eye" viewBox="0 0 64 64" width="20" height="20" aria-hidden="true"><path d="${UP}"/><path d="${DOWN}"/><path class="pupil" d="${PUPIL}"/></svg><figcaption>20</figcaption></figure>
          <figure><svg class="eye" viewBox="0 0 64 64" width="16" height="16" aria-hidden="true"><path d="${UP}"/><path d="${DOWN}"/><path class="pupil" d="${PUPIL}"/></svg><figcaption>16</figcaption></figure>
          <figure><img class="px" src="data:image/png;base64,${png16[n]}" width="64" height="64" alt="The mark rendered at 16 pixels, magnified four times"><figcaption>16 &times;4</figcaption></figure>
        </div>
      </div>
    </div>`).join('')}
  </div>
  <div class="anatomy">
    <div><b>Upper lid</b><p>A chevron, 10 units thick on a 64 grid. Its flat ends close the eye's outer corners.</p></div>
    <div><b>Lower lid</b><p>The same chevron turned over: the point of a shield. The two lids are mirror images, so the mark is calm and balanced.</p></div>
    <div><b>Pupil</b><p>A 16-unit diamond in the signal colour, the only colour in the mark. It is 4 px wide at 16 px.</p></div>
    <div><b>Grid</b><p>Edges at y 28 and 36 land on whole pixels at 16 px, so the slit is two crisp pixels. Clear space: one pupil width on every side.</p></div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">02 · Wordmark and lockup</span><h2>SentinelOps, with the eye's pupil for a dot</h2><p>Space Grotesk 600, tracked in to -0.02em so the word holds together as one shape. The one custom touch: the dot of the i is the mark's ice-blue diamond. In the lockup the mark stands 1.5 times the cap height, with 0.32 em between mark and word.</p></div>
  <div class="pair">${['dark', 'light'].map((n) => `
    <div class="panel t-${n} logo-panel"><p class="panel-label">${n === 'dark' ? 'Night watch' : 'Daylight watch'}</p>
      ${lockup()}
      <div class="logo-row">${wordmark()}${lockup('small-lockup')}</div>
      <div class="logo-row">
        <span class="tab">${eye()}<span>SentinelOps</span><span class="x" aria-hidden="true">&times;</span></span>
        <span class="cap">Browser tab, real 16 px</span>
      </div>
    </div>`).join('')}
  </div>
  <div class="logo-row" style="margin-top:20px"><span class="app-icon">${eye()}</span><p class="cap">App icon (home screen, 192 / 512, apple-touch): the mark on a night tile, because the icon's background is unknown.</p></div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">03 · The eye in motion</span><h2>Lock, wake, and a quiet scan</h2><p>Transform and opacity only. Loops here so you can watch them; in the app each plays once, at the moment named. If your device asks for reduced motion, this page shows them still.</p></div>
  <div class="motion-grid">${motionTiles.map(([cls, title, text, spec]) => `
    <div class="tile">
      <div class="tile-stage"><div class="t-dark">${eye(cls)}</div><div class="t-light">${eye(cls)}</div></div>
      <div class="tile-text"><h3>${title}</h3><p>${text}</p><p class="spec">${spec}</p></div>
    </div>`).join('')}
  </div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">04 · Palette</span><h2>Night watch and daylight watch</h2><p>Deep ink-blue at night, not black. A crisp, cool daylight theme. One signal colour, ice blue, which never means danger: severity and status keep their own scales. Ratios are the worst case across bg, surface and raised.</p></div>
  <div class="pair">
    <div class="panel t-dark"><p class="panel-label">Night watch (dark)</p><div class="strip" aria-hidden="true"><span style="background:var(--color-bg)"></span><span style="background:var(--color-surface)"></span><span style="background:var(--color-surface-raised)"></span><span style="background:var(--color-signal)"></span></div>${swatches('dark')}</div>
    <div class="panel t-light"><p class="panel-label">Daylight watch (light)</p><div class="strip" aria-hidden="true"><span style="background:var(--color-bg)"></span><span style="background:var(--color-surface)"></span><span style="background:var(--color-surface-raised)"></span><span style="background:var(--color-signal)"></span></div>${swatches('light')}</div>
  </div>
  <div class="callout">
    <div><h3>The signal problem</h3><p>The exploration found that the icy <span class="mono">#7dd3fc</span> is only 1.57:1 on the light background, while <span class="mono">#1596d6</span> clears both but looks dull at night.</p></div>
    <div><h3>The answer: one hue, two depths</h3><p>Ice blue at hue 199 to 202, light on dark and deep on light. Night: <span class="mono">${THEMES.dark.signal}</span>, ${ratio(THEMES.dark.signal, THEMES.dark.bg).toFixed(1)}:1. Day: <span class="mono">${THEMES.light.signal}</span>, ${ratio(THEMES.light.signal, THEMES.light.bg).toFixed(1)}:1. Both are safe for text, not just for shapes.</p>
      <div class="ice"><span class="t-dark" style="color:var(--color-signal)">${THEMES.dark.signal} on night</span><span class="t-light" style="color:var(--color-signal)">${THEMES.light.signal} on day</span></div></div>
    <div><h3>Where there is no theme</h3><p>A standalone logo file or an unknown background uses <span class="mono">${UNIVERSAL_ACCENT}</span>, which clears 3:1 on both (${ratio(UNIVERSAL_ACCENT, THEMES.dark.bg).toFixed(1)} and ${ratio(UNIVERSAL_ACCENT, THEMES.light.bg).toFixed(1)}). The favicon picks the right depth from the system theme.</p></div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">05 · Type</span><h2>Sharp grotesk, honest mono</h2><p>Space Grotesk for headings and interface. JetBrains Mono wherever a value must be read exactly: IDs, timestamps, counts. Nothing smaller than 12 px, and 12 px only in mono.</p></div>
  <div class="panel t-dark"><p class="panel-label">Scale</p><div class="type-list">${TYPE.map(([label, cls, sample, spec, use]) => `
      <div class="type-row"><div class="meta"><b>${label}</b><span>${spec}</span><span>${use}</span></div><div class="sample ${cls === 'eyebrow' ? 'eyebrow-s' : cls}">${sample}</div></div>`).join('')}
  </div></div>
  <div class="pair" style="margin-top:16px">${['dark', 'light'].map((n) => `
    <div class="panel t-${n} ctx"><p class="panel-label">In context · ${n === 'dark' ? 'night watch' : 'daylight watch'}</p>
      <span class="eyebrow-s">INCIDENT · INC-0142</span>
      <h3 class="h1">Elevated 5xx on the invoices API after the 14:02 deploy</h3>
      <div class="ctx-meta">${sevBadge(SEV[0])}${statusBadge(STATUS[1])}<time class="data-s">2026-11-25 14:07:33 UTC</time><span class="data">3 updates</span></div>
      <p class="body">Rollback started at 14:09. Error rate is back under 0.1% on two of three regions.</p>
    </div>`).join('')}
  </div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">06 · Components</span><h2>The system at work</h2><p>Radii stay small (4 px on controls, 8 px on cards) to echo the mark's sharp angles. Severity reads by bars as well as colour; status by a glyph. Colour is never the only cue.</p></div>
  <div class="pair">${components('dark')}${components('light')}</div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">07 · Contrast</span><h2>Every pair, checked</h2><p>WCAG 2.1: text at least 4.5:1, interface parts at least 3:1. Badge tint is the badge text on its own tinted background (${Math.round(TINT.dark * 100)}% at night, ${Math.round(TINT.light * 100)}% by day, over surface). <span class="mono">border-subtle</span> is decorative and never the only edge of a control.</p></div>
  <details open><summary>Contrast tables, both themes</summary>
    <div class="tables"><div class="scroll">${contrastTable('dark')}</div><div class="scroll">${contrastTable('light')}</div></div>
  </details>
</div></section>
</main>
<footer><div class="wrap">SentinelOps brand board · for sign-off 2 · proposed values in docs/brand/board/proposed-tokens.md</div></footer>
</body>
</html>
`;
writeFileSync(`${OUT}/index.html`, html);
console.log('wrote index.html, facet-mark.svg', html.length);
