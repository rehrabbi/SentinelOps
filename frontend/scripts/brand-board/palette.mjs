// Proposed palette + contrast checks. Exported for the render script.
export const THEMES = {
  dark: {
    bg: '#0a1020', surface: '#0f1729', 'surface-raised': '#162139',
    border: '#5f75a0', 'border-subtle': '#223050',
    text: '#e6edf8', 'text-muted': '#9eafcb',
    signal: '#86d8ff', 'signal-strong': '#c4ecff', 'on-signal': '#04121f',
    danger: '#ff8f8f',
    'sev-critical': '#ff7070', 'sev-high': '#ffa24d', 'sev-medium': '#f2c94c', 'sev-low': '#a7b6cf',
    'status-open': '#86d8ff', 'status-investigating': '#c3b1ff', 'status-resolved': '#6fe3a2', 'status-closed': '#8d9bb4',
    focus: '#c4ecff',
  },
  light: {
    bg: '#f4f7fb', surface: '#ffffff', 'surface-raised': '#ffffff',
    border: '#7486a4', 'border-subtle': '#d9e1ec',
    text: '#0b1426', 'text-muted': '#46546d',
    signal: '#0a6ea8', 'signal-strong': '#06547f', 'on-signal': '#ffffff',
    danger: '#b42318',
    'sev-critical': '#b82525', 'sev-high': '#a34a0b', 'sev-medium': '#7d5800', 'sev-low': '#52607a',
    'status-open': '#0a6ea8', 'status-investigating': '#6a48c9', 'status-resolved': '#17703f', 'status-closed': '#5d6a80',
    focus: '#06547f',
  },
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
export const TINT = { dark: 0.16, light: 0.1 }; // badge background: this share of the colour over the surface

export function rows(name) {
  const t = THEMES[name];
  const out = [];
  const add = (fg, bg, kind, fgv = t[fg], bgv = t[bg]) => {
    const r = ratio(fgv, bgv);
    out.push({ fg, bg, kind, r, pass: r >= (kind === 'text' ? 4.5 : 3) });
  };
  const surfaces = ['bg', 'surface', 'surface-raised'];
  for (const s of surfaces) {
    for (const f of ['text', 'text-muted', 'signal', 'signal-strong', 'danger']) add(f, s, 'text');
    for (const f of ['border', 'focus']) add(f, s, 'ui');
  }
  add('on-signal', 'signal', 'text');
  add('on-signal', 'signal-strong', 'text');
  const tok = ['sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'status-open', 'status-investigating', 'status-resolved', 'status-closed'];
  for (const k of tok) {
    add(k, 'surface', 'text');
    add(k, 'bg', 'text');
    const tint = mix(t[k], t.surface, TINT[name]);
    add(k, `${k} tint on surface`, 'text', t[k], tint);
  }
  return out;
}
if (process.argv[1].endsWith('palette.mjs')) {
  for (const n of ['dark', 'light']) {
    console.log(`\n== ${n}`);
    for (const r of rows(n)) console.log(`${r.pass ? ' ' : 'X'} ${r.fg.padEnd(22)} on ${r.bg.padEnd(34)} ${r.r.toFixed(2)} ${r.kind}`);
  }
}
