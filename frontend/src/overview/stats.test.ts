import { describe, expect, it } from 'vitest'
import type { Incident, IncidentSeverity, IncidentStatus } from '../api'
import { countBy, meterDomain, niceCeil, openBySeverity, perDay } from './stats'

let seq = 0
function incident(
  status: IncidentStatus,
  severity: IncidentSeverity,
  createdAt = '2026-11-20T10:00:00Z',
): Incident {
  seq += 1
  return {
    id: `id-${seq}`,
    userId: 'user-1',
    title: `Incident ${seq}`,
    description: '',
    status,
    severity,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('countBy', () => {
  it('lists every status with zeros when there are no incidents', () => {
    expect(countBy([], 'status')).toEqual({ open: 0, investigating: 0, resolved: 0, closed: 0 })
  })

  it('lists every severity with zeros when there are no incidents', () => {
    expect(countBy([], 'severity')).toEqual({ low: 0, medium: 0, high: 0, critical: 0 })
  })

  it('counts each level', () => {
    const items = [
      incident('open', 'high'),
      incident('open', 'low'),
      incident('closed', 'high'),
      incident('investigating', 'critical'),
    ]
    expect(countBy(items, 'status')).toEqual({ open: 2, investigating: 1, resolved: 0, closed: 1 })
    expect(countBy(items, 'severity')).toEqual({ low: 1, medium: 0, high: 2, critical: 1 })
  })
})

describe('openBySeverity', () => {
  it('counts open and investigating, and ignores resolved and closed', () => {
    const items = [
      incident('open', 'critical'),
      incident('investigating', 'critical'),
      incident('resolved', 'critical'),
      incident('closed', 'critical'),
      incident('closed', 'low'),
      incident('open', 'medium'),
    ]
    expect(openBySeverity(items)).toEqual({ low: 0, medium: 1, high: 0, critical: 2 })
  })

  it('gives every severity a zero when nothing is open', () => {
    expect(openBySeverity([incident('closed', 'high')])).toEqual({ low: 0, medium: 0, high: 0, critical: 0 })
  })
})

describe('perDay', () => {
  // 25 November 2026, late evening UTC.
  const now = new Date('2026-11-25T23:30:00Z')

  it('has exactly `days` entries, oldest first, ending on the UTC date of `now`', () => {
    const days = perDay([], 30, now)
    expect(days).toHaveLength(30)
    expect(days[0].date).toBe('2026-10-27')
    expect(days[29].date).toBe('2026-11-25')
    expect(days.every((d) => d.count === 0)).toBe(true)
    for (let i = 1; i < days.length; i++) expect(days[i].date > days[i - 1].date).toBe(true)
  })

  it('counts incidents on their UTC creation date', () => {
    const items = [
      incident('open', 'low', '2026-11-25T00:00:00Z'),
      incident('open', 'low', '2026-11-25T22:59:59Z'),
      // 01:00 on the 25th in UTC+2 is 23:00 on the 24th in UTC.
      incident('open', 'low', '2026-11-25T01:00:00+02:00'),
      incident('open', 'low', '2026-10-27T00:00:01Z'),
    ]
    const days = perDay(items, 30, now)
    expect(days[29]).toEqual({ date: '2026-11-25', count: 2 })
    expect(days[28]).toEqual({ date: '2026-11-24', count: 1 })
    expect(days[0]).toEqual({ date: '2026-10-27', count: 1 })
  })

  it('leaves out incidents from before the window, after now, or with an unreadable date', () => {
    const items = [
      incident('open', 'low', '2026-10-25T12:00:00Z'), // 31 days ago
      incident('open', 'low', '2026-10-26T23:59:59Z'), // the day before the window starts
      incident('open', 'low', '2026-11-26T00:00:00Z'), // tomorrow (clock skew)
      incident('open', 'low', 'not a date'),
    ]
    const days = perDay(items, 30, now)
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0)
  })

  it('crosses month and year boundaries in UTC', () => {
    const days = perDay([], 3, new Date('2027-01-01T00:10:00Z'))
    expect(days.map((d) => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
  })
})

describe('scales', () => {
  it('niceCeil rounds up to 2, 4, 6, 8 or 10 times a power of ten, so the midpoint is a whole number', () => {
    expect([0, 1, 2, 3, 5, 7, 9, 11, 15, 21, 41, 99, 1234].map(niceCeil)).toEqual([
      2, 2, 2, 4, 6, 8, 10, 20, 20, 40, 60, 100, 2000,
    ])
  })

  it('meterDomain never drops below 5, so one incident draws a short bar, not a full one', () => {
    expect(meterDomain(0)).toBe(5)
    expect(meterDomain(1)).toBe(5)
    expect(meterDomain(5)).toBe(5)
    expect(meterDomain(6)).toBe(6)
    expect(meterDomain(11)).toBe(20)
    expect(meterDomain(1234)).toBe(2000)
  })
})
