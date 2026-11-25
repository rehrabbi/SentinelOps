// Prints the token blocks and contrast tables that docs/brand/board/proposed-tokens.md carries,
// for pasting after a palette change:  node scripts/brand-board/gen-md.mjs
import { THEMES, ratio, mix, TINT } from './palette.mjs';
import { UNIVERSAL_ACCENT } from './eye.mjs';
const ORDER = ['bg', 'surface', 'surface-raised', 'border', 'border-subtle', 'text', 'text-muted', 'signal', 'signal-strong', 'on-signal', 'danger',
  'sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'status-open', 'status-investigating', 'status-resolved', 'status-closed'];
const block = (n) => ORDER.map((k) => `  --color-${k}: ${THEMES[n][k]};${k === 'border-subtle' ? ' /* new */' : ''}`).join('\n') + '\n  --color-focus: var(--color-signal-strong);';
const fgs = ['text', 'text-muted', 'signal', 'signal-strong', 'danger', 'border', 'focus', 'sev-critical', 'sev-high', 'sev-medium', 'sev-low', 'status-open', 'status-investigating', 'status-resolved', 'status-closed'];
function table(n) {
  const t = THEMES[n];
  let s = `| Foreground | on bg | on surface | on surface-raised | badge (on own tint) | needs |\n|---|---:|---:|---:|---:|---:|\n`;
  for (const k of fgs) {
    const need = k === 'border' || k === 'focus' ? 3 : 4.5;
    const badge = k.startsWith('sev') || k.startsWith('status') ? ratio(t[k], mix(t[k], t.surface, TINT[n])).toFixed(2) : '–';
    s += `| \`${k}\` ${t[k]} | ${['bg', 'surface', 'surface-raised'].map((b) => ratio(t[k], t[b]).toFixed(2)).join(' | ')} | ${badge} | ${need} |\n`;
  }
  s += `| \`on-signal\` ${t['on-signal']} on \`signal\` | ${ratio(t['on-signal'], t.signal).toFixed(2)} | | | – | 4.5 |\n`;
  s += `| \`on-signal\` on \`signal-strong\` (hover) | ${ratio(t['on-signal'], t['signal-strong']).toFixed(2)} | | | – | 4.5 |\n`;
  return s;
}
let min = Infinity;
for (const n of ['dark', 'light']) { const t = THEMES[n]; for (const k of fgs) for (const b of ['bg', 'surface', 'surface-raised']) min = Math.min(min, ratio(t[k], t[b]) / (k === 'border' || k === 'focus' ? 3 : 4.5)); }
console.log(`<!--BLOCK_DARK-->\n${block('dark')}\n<!--BLOCK_LIGHT-->\n${block('light')}\n<!--TABLE_DARK-->\n${table('dark')}\n<!--TABLE_LIGHT-->\n${table('light')}\nUNIVERSAL ${ratio(UNIVERSAL_ACCENT, THEMES.dark.bg).toFixed(2)} ${ratio(UNIVERSAL_ACCENT, THEMES.light.bg).toFixed(2)} minHeadroom ${min.toFixed(3)}`);
