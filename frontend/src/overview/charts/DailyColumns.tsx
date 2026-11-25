import { useState, type PointerEvent } from 'react'
import { dayDomain } from '../stats'
import { formatCount, incidents, longDate, shortDate } from '../format'
import { columnPath, useWidth } from './geometry'
import { Grow } from './motion'

// Incidents reported per UTC day: one column per day, one colour (a single series needs no
// legend; the heading names it). The axis never runs below 4, so one incident is a short column
// on a calm scale rather than a spike to the top. The busiest day carries its count on its cap;
// hovering a day reads out its date and count. Screen readers get the same numbers as text.

export interface DailyColumnsProps {
  days: { date: string; count: number }[]
  reduced: boolean
}

const PLOT = 128 // plot height, px
const TOP = 18 // room above the plot for the busiest day's label
const AXIS = 22 // x-axis label band
const HEIGHT = TOP + PLOT + AXIS
const GAP = 2 // surface gap between neighbouring columns
const MAX_COLUMN = 24

export function DailyColumns({ days, reduced }: DailyColumnsProps) {
  const [ref, width] = useWidth<HTMLDivElement>(320)
  const [active, setActive] = useState<number | null>(null)

  const counts = days.map((d) => d.count)
  const max = Math.max(0, ...counts)
  const total = counts.reduce((sum, n) => sum + n, 0)
  const domain = dayDomain(max)
  const ticks = [0, domain / 2, domain]

  // Left gutter fits the widest tick label (JetBrains Mono 12 px is about 7.2 px a character).
  const left = Math.ceil(formatCount(domain).length * 7.2) + 10
  const plotWidth = Math.max(0, width - left)
  const slot = days.length > 0 ? plotWidth / days.length : 0
  const column = Math.max(1, Math.min(MAX_COLUMN, slot - GAP))
  const baseline = TOP + PLOT
  const y = (value: number) => baseline - (value / domain) * PLOT

  // The busiest day gets its number on its cap; the latest one if several tie.
  const peak = max > 0 ? counts.lastIndexOf(max) : -1
  const first = days[0]
  const last = days[days.length - 1]
  const middle = days[Math.floor((days.length - 1) / 2)]

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0 || days.length === 0) return
    const i = Math.floor(((event.clientX - box.left) / box.width) * days.length)
    setActive(Math.min(days.length - 1, Math.max(0, i)))
  }

  const busyDays = days.filter((d) => d.count > 0)

  return (
    <div className="overview-daily">
      <p className="overview-readout" aria-hidden="true">
        {active !== null ? (
          <>
            <span className="overview-readout-date">{shortDate(days[active].date)}</span>{' '}
            <span className="overview-readout-count">{formatCount(days[active].count)}</span> reported
          </>
        ) : (
          <>
            <span className="overview-readout-count">{formatCount(total)}</span> reported in {days.length} days
          </>
        )}
      </p>

      <div ref={ref} className="overview-daily-plot">
        <svg
          className="overview-daily-svg"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          height={HEIGHT}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? 'overview-baseline' : 'overview-grid'}
                x1={left}
                x2={width}
                y1={Math.round(y(tick)) + 0.5}
                y2={Math.round(y(tick)) + 0.5}
              />
              <text className="overview-tick" x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatCount(tick)}
              </text>
            </g>
          ))}

          {days.map((day, i) => {
            const height = (day.count / domain) * PLOT
            const x = left + i * slot + (slot - column) / 2
            const fill = i === active ? 'overview-bar overview-fill-day overview-is-active' : 'overview-bar overview-fill-day'
            return (
              <Grow
                key={day.date}
                d={columnPath(x, column, baseline, height)}
                fraction={day.count / domain}
                axis="y"
                reduced={reduced}
                className={fill}
                delay={0.15 + i * 0.012}
              />
            )
          })}

          {peak >= 0 ? (
            <text className="overview-cap" x={left + peak * slot + slot / 2} y={y(max) - 6} textAnchor="middle">
              {formatCount(max)}
            </text>
          ) : (
            <text className="overview-none" x={left + plotWidth / 2} y={TOP + PLOT / 2} dy="0.32em" textAnchor="middle">
              None in the last {days.length} days
            </text>
          )}

          {first && last ? (
            <>
              <text className="overview-tick" x={left} y={baseline + 16} textAnchor="start">
                {shortDate(first.date)}
              </text>
              {plotWidth >= 360 && middle ? (
                <text className="overview-tick" x={left + Math.floor((days.length - 1) / 2) * slot + slot / 2} y={baseline + 16} textAnchor="middle">
                  {shortDate(middle.date)}
                </text>
              ) : null}
              <text className="overview-tick" x={width} y={baseline + 16} textAnchor="end">
                {shortDate(last.date)}
              </text>
            </>
          ) : null}

          {/* One hover target over the whole plot: the nearest day wins, so a 10 px column is
              as easy to hit as the full slot. */}
          <rect
            className="overview-hit"
            x={left}
            y={TOP}
            width={plotWidth}
            height={PLOT}
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      </div>

      {first && last ? (
        <div className="visually-hidden">
          <p>
            {total === 0
              ? `No incidents reported from ${longDate(first.date)} to ${longDate(last.date)}, in UTC.`
              : `${incidents(total)} reported from ${longDate(first.date)} to ${longDate(last.date)}, in UTC, on ${busyDays.length} ${busyDays.length === 1 ? 'day' : 'days'}. Days not listed had none.`}
          </p>
          {busyDays.length > 0 ? (
            <ul>
              {busyDays.map((d) => (
                <li key={d.date}>
                  {longDate(d.date)}: {formatCount(d.count)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
