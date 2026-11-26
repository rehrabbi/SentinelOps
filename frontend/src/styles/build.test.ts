import { build, type Rollup } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// One production build, in memory (write: false), so nothing is written to frontend/dist while
// something else may be using it. VITE_API_URL is empty, as in the production build, which is what
// switches on the /api/me preload (see vite.config.ts).
let outputs: (Rollup.OutputAsset | Rollup.OutputChunk)[]

beforeAll(async () => {
  vi.stubEnv('VITE_API_URL', '')
  const result = (await build({
    logLevel: 'silent',
    build: { write: false },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[]
  outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output)
}, 60_000)

afterAll(() => {
  vi.unstubAllEnvs()
})

const asset = (test: (name: string) => boolean) =>
  outputs.filter((o): o is Rollup.OutputAsset => o.type === 'asset' && test(o.fileName))

// The production CSP has no font-src, so fonts must be separate same-origin files:
// a data: URI would be refused. This checks the emitted CSS.
it('never inlines a font into the built CSS', () => {
  const css = asset((name) => name.endsWith('.css'))
    .map((o) => String(o.source))
    .join('\n')
  expect(css).toContain('@font-face')
  expect(css).not.toContain('url(data:font')
  expect(css).toMatch(/url\(\/assets\/space-grotesk[^)]*\.woff2\)/)
})

// The CSP (public/_headers) forbids inline <script>, <style> and style attributes in served HTML.
describe('the built index.html', () => {
  const html = () => String(asset((name) => name === 'index.html')[0]?.source)

  it('is emitted', () => {
    expect(html()).toContain('<div id="root">')
  })

  it('has no inline script: every <script> has a src and is empty', () => {
    const scripts = [...html().matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    expect(scripts.length).toBeGreaterThan(0)
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\ssrc=/)
      expect(body.trim()).toBe('')
    }
  })

  it('has no <style> element and no style attribute', () => {
    expect(html()).not.toMatch(/<style\b/i)
    expect(html()).not.toMatch(/\sstyle\s*=/i)
  })

  it('keeps the /api/me preload when VITE_API_URL is empty', () => {
    expect(html()).toMatch(
      /<link\b(?=[^>]*\srel="preload")(?=[^>]*\shref="\/api\/me")(?=[^>]*\sas="fetch")(?=[^>]*\scrossorigin="use-credentials")[^>]*>/,
    )
  })
})
