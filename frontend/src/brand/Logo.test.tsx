import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { Logo } from './Logo'

const VARIANTS = ['mark', 'wordmark', 'lockup'] as const

describe('Logo accessibility', () => {
  for (const variant of VARIANTS) {
    it(`${variant}: with a title it is an image named by that title`, () => {
      const { container } = render(<Logo variant={variant} title="SentinelOps" />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('role')).toBe('img')
      expect(svg?.getAttribute('aria-hidden')).toBeNull()
      expect(screen.getByRole('img', { name: 'SentinelOps' })).toBe(svg)
      expect(svg?.querySelector('title')?.textContent).toBe('SentinelOps')
    })

    it(`${variant}: without a title it is hidden from assistive technology`, () => {
      const { container } = render(<Logo variant={variant} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
      expect(svg?.getAttribute('role')).toBeNull()
      expect(svg?.querySelector('title')).toBeNull()
    })
  }

  it('sizes by height and keeps the aspect ratio', () => {
    const { container } = render(<Logo variant="mark" size={40} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('height')).toBe('40')
    expect(svg?.getAttribute('width')).toBe('40')
  })
})

describe('Logo motion', () => {
  it('an animated mark starts the wake: the pupil is hidden until it fades in', () => {
    const { container } = render(<Logo variant="mark" animated />)
    const pupil = container.querySelector<SVGElement>('.logo-pupil')
    expect(pupil?.style.opacity).toBe('0')
  })

  it('under reduced motion an animated mark renders still', () => {
    setMatchMedia('(prefers-reduced-motion: reduce)', true)
    const { container } = render(<Logo variant="mark" animated />)
    const pupil = container.querySelector<SVGElement>('.logo-pupil')
    expect(pupil).not.toBeNull()
    expect(pupil?.getAttribute('style')).toBeNull()
    for (const lid of container.querySelectorAll('.logo-lid')) {
      expect(lid.getAttribute('style')).toBeNull()
    }
  })

  // The production CSP is style-src 'self': a <style> element added at run time would be
  // blocked. Motion must animate through element.style only.
  it('Motion adds no <style> element to the document', async () => {
    const before = new Set(document.querySelectorAll('style'))
    const { container } = render(<Logo variant="mark" animated />)
    render(<Logo variant="lockup" animated title="SentinelOps" />)
    // Let the wake run to the end (about one second).
    await new Promise((resolve) => setTimeout(resolve, 1300))
    // The animation really ran (so this is not a vacuous pass): the pupil has faded in.
    expect(container.querySelector<SVGElement>('.logo-pupil')?.style.opacity).toBe('1')
    const added = [...document.querySelectorAll('style')].filter((el) => !before.has(el))
    expect(added).toEqual([])
  })
})
