import { useEffect, useId, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ApiError,
  createIncident,
  getIncidents,
  updateIncident,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from '../api'
import { transition } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import { Overview } from '../overview/Overview'
import { SeverityBadge, StatusBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardTitle } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { Spinner } from '../ui/Spinner'
import { toast } from '../ui/toast-store'
import './Incidents.css'

// The load state for the incident list: exactly one of these three.
type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; incidents: Incident[] }

const SEVERITIES: IncidentSeverity[] = ['low', 'medium', 'high', 'critical']
const STATUSES: IncidentStatus[] = ['open', 'investigating', 'resolved', 'closed']

// Timestamps are shown in UTC, with the zone written out, so two people in different places read
// the same moment.
const WHEN = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : `${WHEN.format(date)} UTC`
}

/**
 * The incident screen: the overview, the report form and the list. It owns the one load of the
 * incident list and hands the same list to the overview and the rows, so a new incident or a
 * status change shows up in the counts at once.
 */
export function Incidents() {
  const [list, setList] = useState<ListState>({ kind: 'loading' })

  useEffect(() => {
    getIncidents()
      .then((incidents) => setList({ kind: 'ready', incidents }))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : 'Failed to load incidents'
        setList({ kind: 'error', message })
      })
  }, [])

  // Prepend a newly created incident (newest first).
  function handleCreated(incident: Incident) {
    setList((prev) =>
      prev.kind === 'ready'
        ? { kind: 'ready', incidents: [incident, ...prev.incidents] }
        : { kind: 'ready', incidents: [incident] },
    )
  }

  // Replace an incident in place after an update.
  function handleUpdated(updated: Incident) {
    setList((prev) =>
      prev.kind === 'ready'
        ? { kind: 'ready', incidents: prev.incidents.map((i) => (i.id === updated.id ? updated : i)) }
        : prev,
    )
  }

  return (
    <div className="incidents-page">
      <h1 className="incidents-h1">Incidents</h1>

      {/* Not drawn until there is data, so "0 open" never flashes before the list arrives. */}
      {list.kind === 'ready' && <Overview incidents={list.incidents} />}

      <ReportForm onCreated={handleCreated} />

      <section className="incidents-section" aria-labelledby="incidents-list-title">
        <h2 id="incidents-list-title" className="incidents-h2">
          All incidents
        </h2>
        {list.kind === 'loading' && (
          <p className="incidents-loading">
            <Spinner label="Loading incidents" />
            <span aria-hidden="true">Loading incidents…</span>
          </p>
        )}
        {list.kind === 'error' && (
          <p className="incidents-error" role="alert">
            {list.message}
          </p>
        )}
        {list.kind === 'ready' && list.incidents.length === 0 && (
          <EmptyState
            headingLevel={3}
            title="No incidents yet"
            body="Nothing has been reported. When something goes wrong, report it above and it will show up here."
          />
        )}
        {list.kind === 'ready' && list.incidents.length > 0 && (
          <IncidentList incidents={list.incidents} onUpdated={handleUpdated} />
        )}
      </section>
    </div>
  )
}

function IncidentList({
  incidents,
  onUpdated,
}: {
  incidents: Incident[]
  onUpdated: (incident: Incident) => void
}) {
  return (
    <ul className="incidents-list">
      {/* initial={false}: rows present on load just appear; only later arrivals animate. */}
      <AnimatePresence initial={false}>
        {incidents.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} onUpdated={onUpdated} />
        ))}
      </AnimatePresence>
    </ul>
  )
}

// One incident. Severity and status read as badges; the status changes through an inline select
// that PATCHes on change. The select is controlled by the saved status, so a failed save leaves
// the previous value in place and the row says why.
function IncidentRow({
  incident,
  onUpdated,
}: {
  incident: Incident
  onUpdated: (incident: Incident) => void
}) {
  const reduced = useReducedMotion()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function changeStatus(status: IncidentStatus) {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateIncident(incident.id, { status })
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const edited = incident.updatedAt !== incident.createdAt

  return (
    <motion.li
      className="incidents-row"
      // Quiet: a short slide down into place, and a collapse on the way out. Nothing waits on it.
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0, transition: transition('enter', reduced) }}
      exit={
        reduced
          ? { opacity: 0, transition: transition('exit', true) }
          : { opacity: 0, height: 0, transition: transition('exit', false) }
      }
      layout={reduced ? false : 'position'}
    >
      <div className="incidents-main">
        <p className="incidents-title">{incident.title}</p>
        {incident.description && <p className="incidents-desc">{incident.description}</p>}
        <p className="incidents-meta">
          <time dateTime={incident.createdAt}>Reported {formatWhen(incident.createdAt)}</time>
          {edited && (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={incident.updatedAt}>Updated {formatWhen(incident.updatedAt)}</time>
            </>
          )}
        </p>
        {error && (
          <p className="incidents-error incidents-row-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="incidents-side">
        <div className="incidents-badges">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
        <select
          className="incidents-status-select"
          aria-label={`Status for ${incident.title}`}
          value={incident.status}
          disabled={saving}
          onChange={(e) => changeStatus(e.target.value as IncidentStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </motion.li>
  )
}

// The report form. On success it clears itself and hands the new incident up. The server sets
// the status (open) and the owner; the form sends only a title, description and severity.
function ReportForm({ onCreated }: { onCreated: (incident: Incident) => void }) {
  const titleId = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('medium')
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ kind: 'submitting' })
    try {
      const incident = await createIncident({ title, description, severity })
      onCreated(incident)
      setTitle('')
      setDescription('')
      setSeverity('medium')
      setState({ kind: 'idle' })
      toast('Incident reported', 'success')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong'
      setState({ kind: 'error', message })
    }
  }

  const submitting = state.kind === 'submitting'

  return (
    <Card as="section" className="incidents-form-card" aria-labelledby={titleId}>
      <CardTitle as="h2" id={titleId}>
        Report an incident
      </CardTitle>
      <form className="incidents-form" onSubmit={handleSubmit}>
        <Field
          label="Title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
        <Field label="Description" hint="Optional. What happened, and what you have seen so far.">
          {(control) => (
            <textarea
              {...control}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          )}
        </Field>
        <Field label="Severity" className="incidents-severity-field">
          {(control) => (
            <select
              {...control}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </Field>
        {state.kind === 'error' && (
          <p className="incidents-error" role="alert">
            {state.message}
          </p>
        )}
        <div className="incidents-form-actions">
          <Button type="submit" busy={submitting}>
            {submitting ? 'Reporting…' : 'Report incident'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
