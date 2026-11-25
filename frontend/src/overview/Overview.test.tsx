import { act, render, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Incident, IncidentSeverity, IncidentStatus } from '../api'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce } from '../test/visibility'
import { capLabel } from './charts/geometry'
import { Overview } from './Overview'

const NOW = new Date('2026-11-25T12:00:00Z')
const REDUCE = '(prefers-reduced-motion: reduce)'

let seq = 0
function incident(status: IncidentStatus, severity: IncidentSeverity, createdAt = '2026-11-20T09:00:00Z'): Incident {
  seq += 1
  return {
    id: `id-${seq}`,
    userId: 'u-1',
    title: `Incident ${seq}`,
    description: '',
    status,
    severity,
    createdAt,
    updatedAt: createdAt,
  }
}

function many(n: number, status: IncidentStatus, severity: IncidentSeverity, createdAt?: string): Incident[] {
  return Array.from({ length: n }, () => incident(status, severity, createdAt))
}

// 3 critical open, 2 high investigating, 1 low resolved, 4 medium closed: 5 open, 10 in all.
// Created on 12 November (6) and 24 November (4), plus nothing else.
const SAMPLE: Incident[] = [
  ...many(3, 'open', 'critical', '2026-11-12T08:00:00Z'),
  ...many(2, 'investigating', 'high', '2026-11-12T20:00:00Z'),
  ...many(1, 'resolved', 'low', '2026-11-12T23:59:00Z'),
  ...many(4, 'closed', 'medium', '2026-11-24T10:00:00Z'),
]

/** The headline counts as their text, e.g. ["5 open", ...]. */
function headline(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.overview-stat')].map((el) => el.textContent ?? '')
}

/** The figure at the end of each meter row of the chart headed `name`. */
function meterValues(name: string): string[] {
  const list = screen.getByRole('list', { name })
  return within(list)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('.overview-meter-value')?.textContent ?? '')
}

// Motion's frame loop runs on requestAnimationFrame, timestamps and microtasks. Faking all of them
// makes animation time deterministic: `advance(ms)` moves it on exactly that far, no real waiting.
const MOTION_CLOCK = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance',
  'Date',
  'queueMicrotask',
] as const

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('Overview with no incidents', () => {
  it('shows its empty state and no NaN anywhere', () => {
    const { container } = render(<Overview incidents={[]} now={NOW} />)
    expect(screen.getByRole('heading', { name: 'Nothing to chart yet' })).toBeTruthy()
    expect(screen.getByText(/counts the incidents you can see/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
    expect(container.querySelector('svg.overview-daily-svg')).toBeNull()
  })
})

describe('Overview counts', () => {
  it('shows "0 open or investigating" when every incident is closed', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={many(2, 'closed', 'high')} now={NOW} />)
    expect(headline(container)[0]).toBe('0 open or investigating')
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('says the counts cover only what this person can see', () => {
    setMatchMedia(REDUCE, true)
    render(<Overview incidents={SAMPLE} now={NOW} />)
    expect(screen.getByText('Counts cover the 10 incidents you can see.')).toBeTruthy()
  })

  it('handles a single incident in the singular, with no NaN', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={[incident('open', 'low', '2026-11-25T01:00:00Z')]} now={NOW} />)
    expect(screen.getByText('Counts cover the 1 incident you can see.')).toBeTruthy()
    expect(headline(container)).toEqual(['1 open or investigating', '0 critical, still open or investigating', '1 reported in the last 30 days'])
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('writes large counts with a thousands separator', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={many(1234, 'open', 'critical', '2026-11-25T01:00:00Z')} now={NOW} />)
    expect(headline(container)[0]).toBe('1,234 open or investigating')
    expect(meterValues('By severity')).toEqual(['1,234', '0', '0', '0'])
  })
})

describe('Overview under reduced motion', () => {
  // The fail-then-pass proof for this test is in the task report: with the media query left
  // unset (motion on), every count reads "0" on the first render and this test fails.
  it('shows every number at its final value on the first render, with nothing hidden', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={SAMPLE} now={NOW} />)

    expect(headline(container)).toEqual(['5 open or investigating', '3 critical, still open or investigating', '10 reported in the last 30 days'])
    expect(meterValues('By severity')).toEqual(['3', '2', '0', '0'])
    expect(meterValues('By status')).toEqual(['3', '2', '1', '4'])
    expect(container.querySelector('.overview-readout')?.textContent).toBe('10 reported in 30 days')
    expect(container.querySelector('.overview-cap')?.textContent).toBe('6')

    expectShownAtOnce(...container.querySelectorAll<HTMLElement>('.overview-stat-value, .overview-meter-value'))
    // Bars are drawn at full length with no transform: no inline style on any of them.
    const bars = container.querySelectorAll('.overview-bar')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) expect(bar.getAttribute('style')).toBeNull()
  })
})

describe('Overview motion', () => {
  // Once for the block, not per test: Motion's frame loop keeps a scheduled frame between tests,
  // and swapping the clock under it would strand that frame.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: [...MOTION_CLOCK] })
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('counts up from 0 on load and reaches the final values', async () => {
    const { container } = render(<Overview incidents={SAMPLE} now={NOW} />)
    expect(headline(container)[0]).toBe('0 open or investigating')
    await advance(1200)
    expect(headline(container)).toEqual(['5 open or investigating', '3 critical, still open or investigating', '10 reported in the last 30 days'])
  })

  it('animates to a new value when the incidents change, without remounting', async () => {
    const { container, rerender } = render(<Overview incidents={SAMPLE} now={NOW} />)
    await advance(1200) // load: 0.8 s plus up to 0.28 s of stagger
    const value = container.querySelector<HTMLElement>('.overview-stat-value')
    const bar = container.querySelector<SVGElement>('.overview-fill-critical')
    expect(value?.textContent).toBe('5')
    expect(bar?.style.transform).toMatch(/^(none|)$/)

    // 5 -> 105 open or investigating, and the critical bar 3 -> 103 on a scale that moves from
    // 5 to 200. A wide jump leaves a long stretch of in-between values to sample.
    rerender(<Overview incidents={[...SAMPLE, ...many(100, 'open', 'critical', '2026-11-25T08:00:00Z')]} now={NOW} />)

    // Mid-change (the change runs 0.45 s): the count is between the two values and the bar is
    // still scaled. A Count or Grow that snapped to the new value would fail here.
    await advance(100)
    const mid = Number(value?.textContent?.replace(/,/g, ''))
    expect(mid).toBeGreaterThan(5)
    expect(mid).toBeLessThan(105)
    expect(bar?.style.transform).toMatch(/scaleX\((?!1\))[\d.]+\)/)

    await advance(600)
    expect(container.querySelector('.overview-stat-value')).toBe(value)
    expect(container.querySelector('.overview-fill-critical')).toBe(bar)
    expect(headline(container)[0]).toBe('105 open or investigating')
    // The bar finished: its scale is back to 1.
    expect(bar?.style.transform).toMatch(/^(none|)$/)
  })

  it('reserves the final width of a count from the first frame, so nothing beside it slides', async () => {
    const { container } = render(<Overview incidents={many(1234, 'open', 'critical', '2026-11-25T01:00:00Z')} now={NOW} />)
    const stat = container.querySelector<HTMLElement>('.overview-stat-value > span')
    const meter = container.querySelector<HTMLElement>('.overview-meter-value > span')
    expect(stat?.textContent).toBe('0')
    expect(stat?.style.minWidth).toBe('5ch') // "1,234"
    expect(meter?.style.minWidth).toBe('5ch')
    await advance(1200)
    expect(stat?.textContent).toBe('1,234')
  })

  it('adds no <style> element while animating (the CSP is style-src self)', async () => {
    const before = new Set(document.querySelectorAll('style'))
    render(<Overview incidents={SAMPLE} now={NOW} />)
    await advance(1200)
    expect([...document.querySelectorAll('style')].filter((el) => !before.has(el))).toEqual([])
  })
})

describe('Overview per-day labels', () => {
  it('keeps the label of the busiest day inside the plot when it is the last column', () => {
    setMatchMedia(REDUCE, true)
    // All 1,234 today: the busiest day is the right-most column. Tests lay out at 320 px.
    const { container } = render(<Overview incidents={many(1234, 'open', 'low', '2026-11-25T01:00:00Z')} now={NOW} />)
    const cap = container.querySelector('.overview-cap')
    expect(cap?.textContent).toBe('1,234')
    expect(cap?.getAttribute('text-anchor')).toBe('end')
    expect(cap?.getAttribute('x')).toBe('320')
  })

  it('centres a label that fits, and pins one at either edge to that edge', () => {
    expect(capLabel(150, '12', 40, 320)).toEqual({ x: 150, anchor: 'middle' })
    expect(capLabel(316, '1,234', 40, 320)).toEqual({ x: 320, anchor: 'end' })
    expect(capLabel(44, '1,234', 40, 320)).toEqual({ x: 40, anchor: 'start' })
  })
})

describe('Overview accessibility', () => {
  it('gives each chart a heading and names its list or summary', () => {
    setMatchMedia(REDUCE, true)
    render(<Overview incidents={SAMPLE} now={NOW} />)
    for (const name of ['By severity', 'By status', 'Reported per day']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
    // Rows read as words and numbers: the badge says the scale, the level and the count.
    const sev = within(screen.getByRole('list', { name: 'By severity' })).getAllByRole('listitem')
    expect(sev[0].textContent).toBe('Severity: critical3')
  })

  it('hides every chart SVG from assistive technology', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={SAMPLE} now={NOW} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('summarises the per-day chart in text, with unambiguous UTC dates', () => {
    setMatchMedia(REDUCE, true)
    render(<Overview incidents={SAMPLE} now={NOW} />)
    expect(
      screen.getByText(
        '10 incidents reported from 27 October 2026 to 25 November 2026, in UTC, on 2 days. Days not listed had none.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('12 November 2026: 6')).toBeTruthy()
    expect(screen.getByText('24 November 2026: 4')).toBeTruthy()
  })

  it('says so when nothing was reported in the window', () => {
    setMatchMedia(REDUCE, true)
    render(<Overview incidents={[incident('closed', 'low', '2026-01-01T00:00:00Z')]} now={NOW} />)
    expect(screen.getByText('No incidents reported from 27 October 2026 to 25 November 2026, in UTC.')).toBeTruthy()
  })
})
