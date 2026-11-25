import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every stylesheet in this app is global, so class names are the only thing keeping one screen's
// rules off another's. The kit (src/ui, src/layout) is used by every screen, so its classes are
// namespaced `ui-` and nothing outside the kit defines a `ui-` class. One exception is kept from
// the plan's contract: the severity modifier `sev-<level>`, only ever used together with `.ui-badge`.
// The legacy stylesheet (App.css) and its token aliases are retired; these tests keep them out.

const src = join(import.meta.dirname, '..')

/** Class names used in the selectors of a stylesheet (declaration values are ignored). */
function selectorClasses(css: string): Set<string> {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const classes = new Set<string>()
  // Every "{" closes a selector (or an at-rule prelude); the selector starts after the
  // previous "{", "}" or ";", which also handles nested rules.
  const chunks = noComments.split('{').slice(0, -1)
  for (const chunk of chunks) {
    const selector = chunk.split(/[{};]/).pop() ?? ''
    if (selector.trim().startsWith('@')) continue
    for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(match[1])
  }
  return classes
}

function filesUnder(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path, test)
    return test(entry.name) ? [path] : []
  })
}

const isKit = (file: string) => {
  const top = relative(src, file).split(sep)[0]
  return top === 'ui' || top === 'layout'
}
const stylesheets = filesUnder(src, (name) => name.endsWith('.css'))
const kit = stylesheets.filter(isKit)
const rest = stylesheets.filter((file) => !isKit(file))
const label = (file: string) => relative(src, file).split(sep).join('/')

describe('class namespaces', () => {
  it('finds the stylesheets it guards (the walk works)', () => {
    expect(kit.length).toBeGreaterThanOrEqual(10)
    expect(rest.length).toBeGreaterThanOrEqual(10)
    expect(selectorClasses('.a, .b:hover > .c { x: y }')).toEqual(new Set(['a', 'b', 'c']))
  })

  for (const file of kit) {
    it(`${label(file)} uses only ui- classes (or the sev-<level> badge modifier)`, () => {
      const classes = selectorClasses(readFileSync(file, 'utf8'))
      const stray = [...classes].filter((c) => !c.startsWith('ui-') && !/^sev-(critical|high|medium|low)$/.test(c))
      expect(stray).toEqual([])
    })
  }

  for (const file of rest) {
    it(`${label(file)} defines no ui- class (those belong to the kit)`, () => {
      const classes = selectorClasses(readFileSync(file, 'utf8'))
      expect([...classes].filter((c) => c.startsWith('ui-'))).toEqual([])
    })
  }
})

describe('the retired legacy stylesheet', () => {
  it('App.css is gone and nothing imports it', () => {
    expect(existsSync(join(src, 'App.css'))).toBe(false)
    const importers = filesUnder(src, (name) => /\.(tsx?|css)$/.test(name) && !name.endsWith('.test.ts'))
      .filter((file) => /(import\s*['"][^'"]*App\.css|@import[^;]*App\.css)/.test(readFileSync(file, 'utf8')))
      .map(label)
    expect(importers).toEqual([])
  })

  it('tokens.css no longer defines the legacy aliases', () => {
    const tokens = readFileSync(join(src, 'styles', 'tokens.css'), 'utf8')
    const legacy = ['--text', '--text-h', '--bg', '--border', '--code-bg', '--accent', '--accent-bg', '--accent-border', '--social-bg', '--shadow', '--sans', '--heading', '--mono']
    // A declaration: the name at the start of a line, or after "{" or ";", then a colon.
    const defined = (name: string) => new RegExp(String.raw`(^|[\s;{])${name}\s*:`, 'm').test(tokens)
    expect(legacy.filter(defined)).toEqual([])
  })
})
