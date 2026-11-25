import type { ReactNode } from 'react'
import { meterDomain } from '../stats'
import { barPath, useWidth } from './geometry'
import { Count, Grow } from './motion'

// A meter list: one row per level, each with its name, a bar and its count, the bars on one
// shared baseline and scale so rows compare at a glance. The rows are real list items, so the
// list itself is the screen-reader summary: the label's words and the count are text, and only
// the bar is decorative.

export interface MeterRow {
  key: string
  /** The level's name, with its own non-colour cue (a severity meter or status glyph). */
  label: ReactNode
  value: number
  /** Class that colours the bar (a severity or status token). */
  fill: string
}

export interface MeterListProps {
  rows: MeterRow[]
  reduced: boolean
  /** id of the chart's heading, which names the list. */
  labelledBy: string
}

const BAR = 12
const HEIGHT = 20

export function MeterList({ rows, reduced, labelledBy }: MeterListProps) {
  const domain = meterDomain(Math.max(0, ...rows.map((row) => row.value)))
  return (
    <ul className="overview-meters" aria-labelledby={labelledBy}>
      {rows.map((row, i) => (
        <li key={row.key} className="overview-meter">
          <span className="overview-meter-label">{row.label}</span>
          <MeterBar fraction={row.value / domain} fill={row.fill} reduced={reduced} delay={0.1 + i * 0.06} />
          <span className={row.value === 0 ? 'overview-meter-value overview-is-zero' : 'overview-meter-value'}>
            <Count value={row.value} reduced={reduced} delay={0.1 + i * 0.06} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function MeterBar({ fraction, fill, reduced, delay }: { fraction: number; fill: string; reduced: boolean; delay: number }) {
  const [ref, width] = useWidth<HTMLSpanElement>(160)
  // Anything above zero is at least 3 px, so a count of one still leaves a mark on a long scale.
  const length = fraction > 0 ? Math.max(3, fraction * width) : 0
  const y = (HEIGHT - BAR) / 2
  return (
    <span ref={ref} className="overview-meter-track">
      <svg
        className="overview-meter-svg"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        height={HEIGHT}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <line className="overview-baseline" x1="0.5" x2="0.5" y1="0" y2={HEIGHT} />
        <Grow d={barPath(length, y, BAR)} fraction={fraction} axis="x" reduced={reduced} className={`overview-bar ${fill}`} delay={delay} />
      </svg>
    </span>
  )
}
