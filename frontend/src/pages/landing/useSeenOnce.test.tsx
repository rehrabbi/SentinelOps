import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMatchMedia } from '../../test/setup'
import { useSeenOnce } from './useSeenOnce'

/** A stand-in IntersectionObserver: records what it was asked to watch, and fires only when told. */
class StubObserver {
  static instances: StubObserver[] = []
  readonly callback: IntersectionObserverCallback
  readonly options: IntersectionObserverInit | undefined
  readonly targets: Element[] = []
  disconnected = false

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    StubObserver.instances.push(this)
  }
  observe(el: Element) {
    this.targets.push(el)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  takeRecords() {
    return []
  }

  /** Report the watched element as intersecting by `ratio` of its own area. */
  fire(ratio: number) {
    const entries = this.targets.map(
      (target) =>
        ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio }) as IntersectionObserverEntry,
    )
    act(() => this.callback(entries, this as unknown as IntersectionObserver))
  }
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useSeenOnce(ref)
  // As tall as the reviewer's case: ~1780 px of content in a 140 px viewport.
  return (
    <div ref={ref} style={{ height: '1780px' }} data-testid="probe">
      {seen ? 'seen' : 'waiting'}
    </div>
  )
}

beforeEach(() => {
  StubObserver.instances = []
  vi.stubGlobal('IntersectionObserver', StubObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSeenOnce', () => {
  it('waits until the element comes into view', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('waiting')
    expect(StubObserver.instances).toHaveLength(1)
    expect(StubObserver.instances[0].targets).toEqual([screen.getByTestId('probe')])
  })

  it('reveals a tall element on its first intersection, however small a share of it shows', () => {
    render(<Probe />)
    const [observer] = StubObserver.instances
    // Height can never block the reveal: any intersection counts.
    expect(observer.options?.threshold).toBe(0)
    // 140 px of a 1780 px element is under 8% of it; a ratio threshold of 0.1 would never fire.
    observer.fire(140 / 1780)
    expect(screen.getByTestId('probe').textContent).toBe('seen')
    expect(observer.disconnected).toBe(true)
  })

  it('stays revealed once seen', () => {
    render(<Probe />)
    const [observer] = StubObserver.instances
    observer.fire(0.05)
    observer.fire(0)
    expect(screen.getByTestId('probe').textContent).toBe('seen')
  })

  it('reveals before printing (beforeprint)', () => {
    render(<Probe />)
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(screen.getByTestId('probe').textContent).toBe('seen')
  })

  it('reveals when the print media query starts to match', () => {
    render(<Probe />)
    act(() => setMatchMedia('print', true))
    expect(screen.getByTestId('probe').textContent).toBe('seen')
  })

  it('is true at once where there is no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('seen')
    expect(StubObserver.instances).toHaveLength(0)
  })
})
