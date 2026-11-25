import { useId, useMemo } from 'react'
import type { Incident } from '../api'
import { useReducedMotion } from '../motion/useReducedMotion'
import { Card, CardTitle } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SeverityBadge, StatusBadge } from '../ui/Badge'
import { Count } from './charts/motion'
import { DailyColumns } from './charts/DailyColumns'
import { MeterList } from './charts/MeterList'
import { incidents as incidentCount } from './format'
import { countBy, openBySeverity, perDay, SEVERITIES, STATUSES } from './stats'
import './Overview.css'

export interface OverviewProps {
  /** The incidents the signed-in person may see, as the server returned them. */
  incidents: Incident[]
  /** "Now" for the per-day window; tests pin it. Defaults to the current time. */
  now?: Date
}

/** How many days the per-day chart covers. */
const DAYS = 30

/**
 * Counts and small charts above the incident list. Pure: it draws whatever list it is given, and
 * animates to new values when that list changes. Every figure covers only the incidents the
 * person can see (the server scopes the list), and the copy says so.
 */
export function Overview({ incidents, now }: OverviewProps) {
  const reduced = useReducedMotion()
  const titleId = useId()
  const sevId = useId()
  const statusId = useId()
  const dailyId = useId()

  const stats = useMemo(() => {
    const open = openBySeverity(incidents)
    const days = perDay(incidents, DAYS, now ?? new Date())
    return {
      open,
      openTotal: SEVERITIES.reduce((sum, s) => sum + open[s], 0),
      status: countBy(incidents, 'status'),
      days,
      recent: days.reduce((sum, d) => sum + d.count, 0),
    }
  }, [incidents, now])

  if (incidents.length === 0) {
    return (
      <section className="overview" aria-labelledby={titleId}>
        <h2 id={titleId} className="overview-title">
          Overview
        </h2>
        <EmptyState
          headingLevel={3}
          title="Nothing to chart yet"
          body="The overview counts the incidents you can see. Once there are some, it shows them by severity, status and day."
        />
      </section>
    )
  }

  const headline = [
    { key: 'open', value: stats.openTotal, label: 'open or investigating' },
    { key: 'critical', value: stats.open.critical, label: 'critical, still open or investigating' },
    { key: 'recent', value: stats.recent, label: `reported in the last ${DAYS} days` },
  ]

  return (
    <section className="overview" aria-labelledby={titleId}>
      <div className="overview-head">
        <h2 id={titleId} className="overview-title">
          Overview
        </h2>
        <p className="overview-scope">Counts cover the {incidentCount(incidents.length)} you can see.</p>
      </div>

      <ul className="overview-stats">
        {headline.map((stat) => (
          <li key={stat.key} className="overview-stat">
            <span className="overview-stat-value">
              <Count value={stat.value} reduced={reduced} />
            </span>{' '}
            <span className="overview-stat-label">{stat.label}</span>
          </li>
        ))}
      </ul>

      <div className="overview-charts">
        <Card as="section" className="overview-card" aria-labelledby={sevId}>
          <div className="overview-card-head">
            <CardTitle id={sevId}>By severity</CardTitle>
            <p className="overview-card-note">Open or investigating</p>
          </div>
          <MeterList
            labelledBy={sevId}
            reduced={reduced}
            rows={SEVERITIES.map((severity) => ({
              key: severity,
              label: <SeverityBadge severity={severity} />,
              value: stats.open[severity],
              fill: `overview-fill-${severity}`,
            }))}
          />
        </Card>

        <Card as="section" className="overview-card" aria-labelledby={statusId}>
          <div className="overview-card-head">
            <CardTitle id={statusId}>By status</CardTitle>
            <p className="overview-card-note">Every incident you can see</p>
          </div>
          <MeterList
            labelledBy={statusId}
            reduced={reduced}
            rows={STATUSES.map((status) => ({
              key: status,
              label: <StatusBadge status={status} />,
              value: stats.status[status],
              fill: `overview-fill-${status}`,
            }))}
          />
        </Card>

        <Card as="section" className="overview-card overview-card-daily" aria-labelledby={dailyId}>
          <div className="overview-card-head">
            <CardTitle id={dailyId}>Reported per day</CardTitle>
            <p className="overview-card-note">Last {DAYS} days, UTC</p>
          </div>
          <DailyColumns days={stats.days} reduced={reduced} />
        </Card>
      </div>
    </section>
  )
}
