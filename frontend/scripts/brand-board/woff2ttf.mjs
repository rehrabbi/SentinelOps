// Unwraps WOFF 1.0 fonts into plain TrueType so resvg can read them. resvg reads TTF and OTF
// files by path only (no WOFF, no WOFF2), so brandFontFiles() writes the fontsource fonts to a
// temporary folder and returns their paths. The TTFs are never committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

export function woffToTtf(buf) {
  const flavor = buf.readUInt32BE(4), n = buf.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const [off, comp, orig, sum] = [buf.readUInt32BE(o + 4), buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 12), buf.readUInt32BE(o + 16)];
    const raw = buf.subarray(off, off + comp);
    tables.push({ tag: buf.subarray(o, o + 4), sum, data: comp < orig ? inflateSync(raw) : raw });
  }
  const es = Math.floor(Math.log2(n)), sr = 2 ** es * 16;
  const head = Buffer.alloc(12 + 16 * n);
  head.writeUInt32BE(flavor, 0); head.writeUInt16BE(n, 4); head.writeUInt16BE(sr, 6); head.writeUInt16BE(es, 8); head.writeUInt16BE(n * 16 - sr, 10);
  let off = head.length; const parts = [head];
  tables.forEach((t, i) => {
    const r = 12 + i * 16; t.tag.copy(head, r); head.writeUInt32BE(t.sum, r + 4); head.writeUInt32BE(off, r + 8); head.writeUInt32BE(t.data.length, r + 12);
    const pad = (4 - (t.data.length % 4)) % 4; parts.push(t.data, Buffer.alloc(pad)); off += t.data.length + pad;
  });
  return Buffer.concat(parts);
}

const fontsource = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', '@fontsource');
const SOURCES = [
  ...[400, 500, 600, 700].map((w) => `${fontsource}/space-grotesk/files/space-grotesk-latin-${w}-normal.woff`),
  ...[400, 500, 600].map((w) => `${fontsource}/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff`),
];

/** Space Grotesk and JetBrains Mono as TTF files in the system temp folder, for resvg's fontFiles. */
export function brandFontFiles() {
  const dir = join(tmpdir(), 'sentinelops-brand-fonts');
  mkdirSync(dir, { recursive: true });
  return SOURCES.map((src) => {
    const out = join(dir, basename(src).replace('.woff', '.ttf'));
    writeFileSync(out, woffToTtf(readFileSync(src)));
    return out;
  });
}

/**
 * One font file, for exact weights. With several weights of a family loaded, resvg 2.6 picks the
 * wrong one (600 renders as 700, 500 as 400), so anything that must match the type scale loads
 * only the weight it uses.
 */
export function brandFont(family, weight) {
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const file = brandFontFiles().find((f) => basename(f) === `${slug}-latin-${weight}-normal.ttf`);
  if (!file) throw new Error(`no font file for ${family} ${weight}`);
  return file;
}
