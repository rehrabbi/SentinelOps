import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// These check the committed files that `npm run icons` writes. Nothing is generated here:
// run `npm run icons` and commit the result when the logo changes.
const frontend = join(import.meta.dirname, '..', '..')
const repo = join(frontend, '..')

/** Width and height from a PNG's IHDR chunk, which always comes first. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file)
  const signature = '89504e470d0a1a0a'
  expect(buf.subarray(0, 8).toString('hex')).toBe(signature)
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const PNGS: [string, number, number][] = [
  ['frontend/public/favicon-32.png', 32, 32],
  ['frontend/public/apple-touch-icon.png', 180, 180],
  ['frontend/public/icon-192.png', 192, 192],
  ['frontend/public/icon-512.png', 512, 512],
  ['frontend/public/og-image.png', 1200, 630],
  ['docs/images/social-card.png', 1280, 640],
]

describe('rendered icons', () => {
  for (const [file, width, height] of PNGS) {
    it(`${file} is a ${width}x${height} PNG`, () => {
      const path = join(repo, file)
      expect(existsSync(path)).toBe(true)
      expect(pngSize(path)).toEqual({ width, height })
    })
  }
})

describe('site.webmanifest', () => {
  it('parses and lists the 192 and 512 icons', () => {
    const manifest = JSON.parse(readFileSync(join(frontend, 'public/site.webmanifest'), 'utf8'))
    expect(manifest.name).toBe('SentinelOps')
    const icons = manifest.icons as { src: string; sizes: string; type: string }[]
    for (const size of [192, 512]) {
      expect(icons).toContainEqual(
        expect.objectContaining({ src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' }),
      )
    }
  })
})

const SVGS = [
  'frontend/public/favicon.svg',
  'frontend/public/mask-icon.svg',
  ...['mark', 'wordmark', 'lockup'].flatMap((v) => [
    `docs/brand/logo-${v}.svg`,
    `docs/brand/logo-${v}-light.svg`,
  ]),
]

describe('SVG files are inert', () => {
  for (const file of SVGS) {
    it(`${file} has no script, event handler, external reference, image or text`, () => {
      const svg = readFileSync(join(repo, file), 'utf8')
      expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
      expect(svg).not.toMatch(/<script/i)
      expect(svg).not.toMatch(/\son[a-z]+\s*=/i)
      expect(svg).not.toMatch(/<(image|foreignObject|use|a)\b/i)
      expect(svg).not.toMatch(/href\s*=/i)
      expect(svg).not.toMatch(/url\(/i)
      // Text must be outlines, so the files never depend on an installed font.
      expect(svg).not.toMatch(/<text/i)
    })
  }

  it('favicon.svg switches to the night colours in a dark browser', () => {
    const svg = readFileSync(join(frontend, 'public/favicon.svg'), 'utf8')
    expect(svg).toContain('@media (prefers-color-scheme: dark)')
  })
})

describe('index.html', () => {
  const html = readFileSync(join(frontend, 'index.html'), 'utf8')

  it('names the app and links the icon set and manifest', () => {
    expect(html).toContain('<title>SentinelOps</title>')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('href="/favicon-32.png"')
    expect(html).toContain('href="/apple-touch-icon.png"')
    expect(html).toContain('href="/site.webmanifest"')
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)"/)
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: light\)"/)
  })

  it('has link-preview tags with absolute production URLs', () => {
    expect(html).toContain('<meta property="og:image" content="https://sentinelops.pages.dev/og-image.png"')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
  })

  it('has no inline script or style', () => {
    expect(html).not.toMatch(/<style/i)
    expect(html).not.toMatch(/\sstyle=/i)
    for (const tag of html.match(/<script[^>]*>/gi) ?? []) expect(tag).toMatch(/\ssrc=/)
  })
})
