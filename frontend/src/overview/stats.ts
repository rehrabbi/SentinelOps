import type { Incident, IncidentSeverity, IncidentStatus } from '../api'

// The numbers behind the incident overview. Pure functions of the incident list the server
// returned, so they cover only what the signed-in person may see.

/** Most severe first: the order the overview lists them in. */
export const SEVERITIES: readonly IncidentSeverity[] = ['critical', 'high', 'medium', 'low']

/** The order an incident moves through. */
export const STATUSES: readonly IncidentStatus[] = ['open', 'investigating', 'resolved', 'closed']

/** Statuses that still need someone: the overview calls these "open". */
const OPEN: ReadonlySet<IncidentStatus> = new Set(['open', 'investigating'])

/** Every level of `key` with how many incidents have it, zeros included. */
export function countBy(items: Incident[], key: 'status'): Record<IncidentStatus, number>
export function countBy(items: Incident[], key: 'severity'): Record<IncidentSeverity, number>
export function countBy(items: Incident[], key: 'status' | 'severity'): Record<string, number> {
  const levels: readonly string[] = key === 'status' ? STATUSES : SEVERITIES
  const counts: Record<string, number> = Object.fromEntries(levels.map((level) => [level, 0]))
  for (const item of items) {
    const level = item[key]
    if (level in counts) counts[level] += 1
  }
  return counts
}

/** Open incidents (status open or investigating) by severity, zeros included. */
export function openBySeverity(items: Incident[]): Record<IncidentSeverity, number> {
  return countBy(
    items.filter((item) => OPEN.has(item.status)),
    'severity',
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The UTC calendar date of a timestamp, as YYYY-MM-DD. */
function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Incidents created on each of the last `days` UTC days, oldest first, ending with today (the UTC
 * date of `now`). Days without incidents are 0. Incidents outside the window, or with a date that
 * can't be read, are left out.
 */
export function perDay(items: Incident[], days: number, now: Date): { date: string; count: number }[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const result = Array.from({ length: Math.max(0, days) }, (_, i) => ({
    date: utcDate(today - (days - 1 - i) * DAY_MS),
    count: 0,
  }))
  const index = new Map(result.map((day, i) => [day.date, i]))
  for (const item of items) {
    const ms = Date.parse(item.createdAt)
    if (Number.isNaN(ms)) continue
    const i = index.get(utcDate(ms))
    if (i !== undefined) result[i].count += 1
  }
  return result
}

/**
 * The smallest of 2, 4, 6, 8 or 10 times a power of ten (1 and up) that is at least `value`.
 * Even steps keep an axis midpoint a whole number; steps of 2 keep the top close to the data.
 */
export function niceCeil(value: number): number {
  if (!(value > 2)) return 2
  let power = 1
  while (power * 10 < value) power *= 10
  for (const m of [2, 4, 6, 8, 10]) {
    if (m * power >= value) return m * power
  }
  return 10 * power
}

/**
 * The top of the scale for a bar list. Never below 5, so a fresh deployment with one or two
 * incidents draws short bars on a calm scale instead of one bar running the full width.
 */
export function meterDomain(max: number): number {
  return max <= 5 ? 5 : niceCeil(max)
}

/**
 * The top of the per-day column chart's axis. Never below 4 (ticks 0, 2, 4), so a single incident
 * is a short column, not a spike to the top of an axis that runs to 1.
 */
export function dayDomain(max: number): number {
  return Math.max(4, niceCeil(max))
}
