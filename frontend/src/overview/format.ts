// Counts and dates as the overview writes them. Dates are UTC calendar days (YYYY-MM-DD from
// stats.perDay), so they are formatted in UTC too, or a viewer west of Greenwich would see
// every label a day early.

const COUNT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** 1234 -> "1,234". */
export function formatCount(n: number): string {
  return COUNT.format(Number.isFinite(n) ? n : 0)
}

function parseDay(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

/** "2026-11-05" -> "5 Nov", for axis labels. */
export function shortDate(date: string): string {
  return SHORT.format(parseDay(date))
}

/** "2026-11-05" -> "5 November 2026", for screen readers. */
export function longDate(date: string): string {
  return LONG.format(parseDay(date))
}

/** "1 incident", "3 incidents". */
export function incidents(n: number): string {
  return `${formatCount(n)} ${n === 1 ? 'incident' : 'incidents'}`
}
