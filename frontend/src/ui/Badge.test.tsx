import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { IncidentSeverity, IncidentStatus } from '../api'
import { SeverityBadge, StatusBadge } from './Badge'

const SEVERITIES: IncidentSeverity[] = ['critical', 'high', 'medium', 'low']
const STATUSES: IncidentStatus[] = ['open', 'investigating', 'resolved', 'closed']

describe('SeverityBadge', () => {
  for (const severity of SEVERITIES) {
    it(`renders the text "${severity}" with class sev-${severity}`, () => {
      render(<SeverityBadge severity={severity} />)
      const word = screen.getByText(severity)
      const badge = word.closest('.badge')
      expect(badge).not.toBeNull()
      expect(badge).toHaveProperty('className', expect.stringContaining(`sev-${severity}`))
    })
  }

  it('carries a four-bar meter, lit to match the level, so colour is not the only cue', () => {
    const lit = { critical: 4, high: 3, medium: 2, low: 1 } as const
    for (const severity of SEVERITIES) {
      const { container, unmount } = render(<SeverityBadge severity={severity} />)
      const bars = container.querySelectorAll('svg rect')
      expect(bars).toHaveLength(4)
      expect(container.querySelectorAll('svg rect:not(.off)')).toHaveLength(lit[severity])
      expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      unmount()
    }
  })

  it('tells assistive technology what the word is', () => {
    const { container } = render(<SeverityBadge severity="high" />)
    expect(container.textContent).toBe('Severity: high')
  })
})

describe('StatusBadge', () => {
  for (const status of STATUSES) {
    it(`renders the text "${status}" with class status-${status} and a glyph`, () => {
      const { container } = render(<StatusBadge status={status} />)
      const badge = screen.getByText(status).closest('.badge')
      expect(badge).toHaveProperty('className', expect.stringContaining(`status-${status}`))
      expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      expect(container.textContent).toBe(`Status: ${status}`)
    })
  }

  it('gives each status its own glyph', () => {
    const shapes = STATUSES.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} />)
      const svg = container.querySelector('svg')?.innerHTML
      unmount()
      return svg
    })
    expect(new Set(shapes).size).toBe(STATUSES.length)
  })
})
