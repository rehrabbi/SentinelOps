import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// The kit (src/ui, src/layout) lives beside the legacy screens until they are redesigned. Their
// stylesheet, App.css, uses plain global class names (.badge, .status-open, …). If the kit used any
// of the same names, each screen's look would depend on stylesheet order. So every kit class is
// namespaced `ui-`, with one exception kept from the plan's contract: the severity modifier
// `sev-<level>`, only ever used together with `.ui-badge`.

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

function kitStylesheets(): string[] {
  return ['ui', 'layout'].flatMap((dir) =>
    readdirSync(join(src, dir))
      .filter((f) => f.endsWith('.css'))
      .map((f) => join(src, dir, f)),
  )
}

const legacy = selectorClasses(readFileSync(join(src, 'App.css'), 'utf8'))

describe('kit stylesheets and the legacy App.css', () => {
  it('finds the legacy names it guards against (the parser works)', () => {
    expect(legacy.has('badge')).toBe(true)
    expect(legacy.has('status-open')).toBe(true)
    expect(legacy.has('auth-card')).toBe(true)
    expect(kitStylesheets().length).toBeGreaterThanOrEqual(10)
  })

  for (const file of kitStylesheets()) {
    const name = relative(src, file).split(sep).join('/')
    const classes = selectorClasses(readFileSync(file, 'utf8'))

    it(`${name} shares no class name with App.css`, () => {
      expect([...classes].filter((c) => legacy.has(c))).toEqual([])
    })

    it(`${name} uses only ui- classes (or the sev-<level> badge modifier)`, () => {
      const stray = [...classes].filter((c) => !c.startsWith('ui-') && !/^sev-(critical|high|medium|low)$/.test(c))
      expect(stray).toEqual([])
    })
  }
})
