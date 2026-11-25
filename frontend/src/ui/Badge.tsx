import type { IncidentSeverity, IncidentStatus } from '../api'
import './Badge.css'

// Badges from the brand board (section 06). Each carries its word, a shape and a colour, so it
// reads with any one of the three missing. The word stays the raw value ("critical"); CSS
// capitalises it on screen. A visually hidden prefix tells screen readers which scale it is on.

const LIT: Record<IncidentSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 }

// Four rising bars on a 14 x 12 grid, as on the board.
const BARS = [
  { x: 0, y: 9, h: 3 },
  { x: 3.6, y: 6, h: 6 },
  { x: 7.2, y: 3, h: 9 },
  { x: 10.8, y: 0, h: 12 },
]

export function SeverityBadge({ severity, className }: { severity: IncidentSeverity; className?: string }) {
  const lit = LIT[severity]
  return (
    <span className={['ui-badge', 'ui-badge-sev', `sev-${severity}`, className].filter(Boolean).join(' ')}>
      <svg className="ui-badge-bars" viewBox="0 0 14 12" aria-hidden="true" focusable="false">
        {BARS.map((bar, i) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width="2.4"
            height={bar.h}
            rx="0.6"
            className={i < lit ? undefined : 'ui-badge-bar-off'}
          />
        ))}
      </svg>
      <span className="visually-hidden">Severity: </span>
      <span className="ui-badge-word">{severity}</span>
    </span>
  )
}

// Ring for open (waiting for eyes), half ring for investigating, tick for resolved, dot for closed.
function StatusGlyph({ status }: { status: IncidentStatus }) {
  switch (status) {
    case 'open':
      return <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    case 'investigating':
      return (
        <>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 2a4 4 0 0 1 0 8Z" fill="currentColor" />
        </>
      )
    case 'resolved':
      return (
        <path
          d="M2.2 6.3 4.8 8.8 9.8 3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'closed':
      return <circle cx="6" cy="6" r="4.2" fill="currentColor" />
  }
}

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  return (
    <span className={['ui-badge', 'ui-badge-status', `ui-status-${status}`, className].filter(Boolean).join(' ')}>
      <svg className="ui-badge-glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <StatusGlyph status={status} />
      </svg>
      <span className="visually-hidden">Status: </span>
      <span className="ui-badge-word">{status}</span>
    </span>
  )
}
