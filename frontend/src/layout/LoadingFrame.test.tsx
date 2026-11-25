import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingFrame } from './LoadingFrame'

// index.html draws the loading frame before any script runs; React then renders LoadingFrame in
// its place. They must be the same, or the first paint jumps.
const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')

function staticFrame(): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const frame = doc.querySelector('#root > .ui-loading-frame')
  expect(frame, 'index.html has the loading frame inside #root').not.toBeNull()
  return frame as Element
}

describe('the loading frame', () => {
  it('in index.html matches the one React renders (classes and the mark)', () => {
    const fromHtml = staticFrame()
    const { container } = render(<LoadingFrame />)
    const fromReact = container.querySelector('.ui-loading-frame') as Element
    expect(fromHtml.className).toBe(fromReact.className)
    const mark = (frame: Element) => {
      const svg = frame.querySelector('svg.ui-loading-mark') as SVGElement
      return {
        viewBox: svg.getAttribute('viewBox'),
        size: [svg.getAttribute('width'), svg.getAttribute('height')],
        hidden: svg.getAttribute('aria-hidden'),
        paths: [...svg.querySelectorAll('path')].map((p) => [p.getAttribute('d'), p.getAttribute('class')]),
      }
    }
    expect(mark(fromHtml)).toEqual(mark(fromReact))
  })

  it('shows neither shell: no header, navigation or footer', () => {
    const { container } = render(<LoadingFrame />)
    expect(container.querySelector('header, nav, footer, main')).toBeNull()
    expect(staticFrame().querySelector('header, nav, footer, main')).toBeNull()
  })
})
