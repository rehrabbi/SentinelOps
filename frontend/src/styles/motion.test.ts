import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// WCAG 2.2.2: anything that moves by itself for more than 5 seconds needs a way to pause it. So
// nothing in the app loops forever except the loading spinner, which only turns while something
// is actually loading (and stands still under reduced motion, base.css).

const src = join(import.meta.dirname, '..')

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return stylesheets(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

describe('looping animation', () => {
  it('is used only by the spinner', () => {
    const looping = stylesheets(src)
      .filter((file) => /\binfinite\b/.test(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map((file) => relative(src, file).split(sep).join('/'))
    expect(looping).toEqual(['ui/Spinner.css'])
  })
})
