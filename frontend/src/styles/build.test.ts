import { build, type Rollup } from 'vite'
import { expect, it } from 'vitest'

// The production CSP has no font-src, so fonts must be separate same-origin files:
// a data: URI would be refused. This builds in memory and checks the emitted CSS.
it('never inlines a font into the built CSS', async () => {
  const result = (await build({
    logLevel: 'silent',
    build: { write: false },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[]
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output)
  const css = outputs
    .filter((o): o is Rollup.OutputAsset => o.type === 'asset' && o.fileName.endsWith('.css'))
    .map((o) => String(o.source))
    .join('\n')
  expect(css).toContain('@font-face')
  expect(css).not.toContain('url(data:font')
  expect(css).toMatch(/url\(\/assets\/space-grotesk[^)]*\.woff2\)/)
}, 60_000)
