import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Card, CardTitle } from './Card'

// jsdom has no layout, so this cannot measure wrapping. It checks the title carries the class
// that applies `overflow-wrap: anywhere`, and that the stylesheet really gives that class the rule.
it('a 200-character title inside Card keeps overflow-wrap: anywhere', () => {
  const title = 'x'.repeat(200)
  render(
    <Card>
      <CardTitle>{title}</CardTitle>
    </Card>,
  )
  const heading = screen.getByRole('heading', { name: title })
  expect(heading.classList.contains('ui-card-title')).toBe(true)
  expect(heading.closest('.ui-card')).not.toBeNull()

  const css = readFileSync(join(import.meta.dirname, 'Card.css'), 'utf8')
  expect(css).toMatch(/\.ui-card-title\s*\{[^}]*overflow-wrap:\s*anywhere/)
})
