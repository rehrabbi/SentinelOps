import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Incident, IncidentSeverity, IncidentStatus } from '../api'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce } from '../test/visibility'
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
  it('shows "0 open" when every incident is closed', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={many(2, 'closed', 'high')} now={NOW} />)
    expect(headline(container)[0]).toBe('0 open')
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
    expect(headline(container)).toEqual(['1 open', '0 critical and open', '1 reported in the last 30 days'])
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('writes large counts with a thousands separator', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={many(1234, 'open', 'critical', '2026-11-25T01:00:00Z')} now={NOW} />)
    expect(headline(container)[0]).toBe('1,234 open')
    expect(meterValues('Open by severity')).toEqual(['1,234', '0', '0', '0'])
  })
})

describe('Overview under reduced motion', () => {
  // The fail-then-pass proof for this test is in the task report: with the media query left
  // unset (motion on), every count reads "0" on the first render and this test fails.
  it('shows every number at its final value on the first render, with nothing hidden', () => {
    setMatchMedia(REDUCE, true)
    const { container } = render(<Overview incidents={SAMPLE} now={NOW} />)

    expect(headline(container)).toEqual(['5 open', '3 critical and open', '10 reported in the last 30 days'])
    expect(meterValues('Open by severity')).toEqual(['3', '2', '0', '0'])
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
  it('counts up from 0 on load and reaches the final values', async () => {
    const { container } = render(<Overview incidents={SAMPLE} now={NOW} />)
    expect(headline(container)[0]).toBe('0 open')
    await wait(1300)
    expect(headline(container)).toEqual(['5 open', '3 critical and open', '10 reported in the last 30 days'])
  })

  it('animates to a new value when the incidents change, without remounting', async () => {
    const { container, rerender } = render(<Overview incidents={SAMPLE} now={NOW} />)
    await wait(1300)
    const value = container.querySelector('.overview-stat-value')
    const bar = container.querySelector('.overview-fill-critical')
    rerender(<Overview incidents={[...SAMPLE, ...many(2, 'open', 'critical', '2026-11-25T08:00:00Z')]} now={NOW} />)
    await wait(800)
    expect(container.querySelector('.overview-stat-value')).toBe(value)
    expect(container.querySelector('.overview-fill-critical')).toBe(bar)
    expect(headline(container)[0]).toBe('7 open')
    // The bar finished growing: its scale is back to 1.
    expect((bar as SVGElement).style.transform).toMatch(/^(none|)$/)
  })

  it('adds no <style> element while animating (the CSP is style-src self)', async () => {
    const before = new Set(document.querySelectorAll('style'))
    render(<Overview incidents={SAMPLE} now={NOW} />)
    await wait(1300)
    expect([...document.querySelectorAll('style')].filter((el) => !before.has(el))).toEqual([])
  })
})

describe('Overview accessibility', () => {
  it('gives each chart a heading and names its list or summary', () => {
    setMatchMedia(REDUCE, true)
    render(<Overview incidents={SAMPLE} now={NOW} />)
    for (const name of ['Open by severity', 'By status', 'Reported per day']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
    // Rows read as words and numbers: the badge says the scale, the level and the count.
    const sev = within(screen.getByRole('list', { name: 'Open by severity' })).getAllByRole('listitem')
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
