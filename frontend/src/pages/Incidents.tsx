import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
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
import { SeverityBadge, StatusGlyph } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { Spinner } from '../ui/Spinner'
import { toast } from '../ui/toast-store'
import '../ui/Text.css'
import './Incidents.css'

// The load state for the incident list: exactly one of these three. Only a successful load
// produces `ready`, and only `ready` feeds the overview and the rows.
type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; incidents: Incident[] }

const SEVERITIES: IncidentSeverity[] = ['low', 'medium', 'high', 'critical']
const STATUSES: IncidentStatus[] = ['open', 'investigating', 'resolved', 'closed']

/** "medium" -> "Medium", the way the badges write it. Values sent to the API stay lowercase. */
function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

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
  const reduced = useReducedMotion()
  const formId = useId()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  // null until the person opens or closes the form; then the form is open when the list is empty
  // (so someone new sees it) and closed otherwise (so the list comes first).
  const [openPref, setOpenPref] = useState<boolean | null>(null)
  const [focusTitle, setFocusTitle] = useState(false)
  const toggleRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setList({ kind: 'loading' })
    getIncidents()
      .then((incidents) => setList({ kind: 'ready', incidents }))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : 'Failed to load incidents'
        setList({ kind: 'error', message })
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = openPref ?? (list.kind === 'ready' && list.incidents.length === 0)

  function focusToggle() {
    toggleRef.current?.querySelector('button')?.focus()
  }

  function openForm() {
    setFocusTitle(true)
    setOpenPref(true)
  }

  function closeForm() {
    setOpenPref(false)
    setFocusTitle(false)
    focusToggle()
  }

  // Prepend a newly created incident (newest first). If the list never loaded there is no list to
  // add it to; the toast confirms it, and Retry brings in the server's list. A reload that
  // finished first may already hold it, so it is never added twice.
  function handleCreated(incident: Incident) {
    setList((prev) =>
      prev.kind === 'ready'
        ? {
            kind: 'ready',
            incidents: [incident, ...prev.incidents.filter((i) => i.id !== incident.id)],
          }
        : prev,
    )
    toast('Incident reported', 'success')
    closeForm()
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
      <div className="incidents-head">
        <h1 className="ui-page-title">Incidents</h1>
        <div ref={toggleRef}>
          <Button
            variant={open ? 'secondary' : 'primary'}
            aria-expanded={open}
            aria-controls={formId}
            onClick={() => (open ? closeForm() : openForm())}
          >
            Report an incident
          </Button>
        </div>
      </div>

      {open && (
        <motion.div
          id={formId}
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0, transition: transition('enter', reduced) }}
        >
          <ReportForm onCreated={handleCreated} onCancel={closeForm} focusTitle={focusTitle} />
        </motion.div>
      )}

      {/* Not drawn until the list has loaded, so "0 open" never flashes and a failed load never
          shows counts for a list it does not have. */}
      {list.kind === 'ready' && <Overview incidents={list.incidents} />}

      <section className="incidents-section" aria-labelledby="incidents-list-title">
        <h2 id="incidents-list-title" className="ui-section-label">
          Incidents you can see
        </h2>
        {list.kind === 'loading' && (
          <p className="incidents-loading">
            <Spinner label="Loading incidents" />
            <span aria-hidden="true">Loading incidents…</span>
          </p>
        )}
        {list.kind === 'error' && (
          <div className="incidents-load-error">
            <p className="ui-error-text" role="alert">
              {list.message}
            </p>
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
        )}
        {list.kind === 'ready' && list.incidents.length === 0 && (
          <EmptyState
            headingLevel={3}
            title="No incidents yet"
            body="There are none you can see yet. When something goes wrong, report it and it will show up here."
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

// One incident. Severity reads as a badge; status is one native select that carries the status's
// glyph and colour, and PATCHes on change. The select is controlled by the saved status, so a
// failed save leaves the previous value in place and the row says why.
function IncidentRow({
  incident,
  onUpdated,
}: {
  incident: Incident
  onUpdated: (incident: Incident) => void
}) {
  const reduced = useReducedMotion()
  const errorId = useId()
  const selectRef = useRef<HTMLSelectElement>(null)
  const wasSaving = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A disabled select drops focus to the page. Once it is enabled again, give focus back, unless
  // the person has already moved on to something else.
  useEffect(() => {
    if (wasSaving.current && !saving) {
      const active = document.activeElement
      if (!active || active === document.body || active === selectRef.current) selectRef.current?.focus()
    }
    wasSaving.current = saving
  }, [saving])

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

  const reported = formatWhen(incident.createdAt)
  const updatedAt = formatWhen(incident.updatedAt)

  return (
    <motion.li
      className="incidents-row"
      aria-busy={saving || undefined}
      // Quiet: a short slide down into place. Nothing waits on it.
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0, transition: transition('enter', reduced) }}
      layout={reduced ? false : 'position'}
    >
      <div className="incidents-main">
        <p className="incidents-title">{incident.title}</p>
        {incident.description && <p className="incidents-desc">{incident.description}</p>}
        <p className="incidents-meta">
          <time dateTime={incident.createdAt}>Reported {reported}</time>
          {updatedAt !== reported && (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={incident.updatedAt}>Updated {updatedAt}</time>
            </>
          )}
        </p>
        {error && (
          <p id={errorId} className="ui-error-text incidents-row-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="incidents-side">
        <SeverityBadge severity={incident.severity} />
        <div className={`incidents-status incidents-status-${incident.status}`}>
          <svg className="incidents-status-glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <StatusGlyph status={incident.status} />
          </svg>
          <select
            ref={selectRef}
            name="status"
            className="incidents-status-select"
            aria-label={`Status for ${incident.title}`}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            value={incident.status}
            disabled={saving}
            onChange={(e) => changeStatus(e.target.value as IncidentStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {cap(s)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Always in the page so a screen reader hears the text appear. */}
      <span role="status" className="visually-hidden">
        {saving ? 'Saving…' : ''}
      </span>
    </motion.li>
  )
}

// The report form. On success it hands the new incident up (the page closes the form, returns
// focus and shows the toast). The server sets the status (open) and the owner; the form sends
// only a title, description and severity.
function ReportForm({
  onCreated,
  onCancel,
  focusTitle,
}: {
  onCreated: (incident: Incident) => void
  onCancel: () => void
  focusTitle: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('medium')
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  // Opened by the person: put the cursor in the Title field. Opened by default (empty list): leave
  // focus where it is.
  useEffect(() => {
    if (focusTitle) formRef.current?.querySelector('input')?.focus()
  }, [focusTitle])

  // After a failed send the button is disabled for a moment, which drops focus; put it back on the
  // button so the person can fix the text and try again from the keyboard.
  useEffect(() => {
    if (state.kind === 'error') formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
  }, [state])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ kind: 'submitting' })
    try {
      const incident = await createIncident({ title, description, severity })
      onCreated(incident)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong'
      setState({ kind: 'error', message })
    }
  }

  const submitting = state.kind === 'submitting'

  return (
    <Card as="section" className="incidents-form-card" aria-label="Report an incident">
      <form ref={formRef} className="incidents-form" onSubmit={handleSubmit}>
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
                  {cap(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {state.kind === 'error' && (
          <p className="ui-error-text" role="alert">
            {state.message}
          </p>
        )}
        <div className="incidents-form-actions">
          <Button type="submit" busy={submitting}>
            {submitting ? 'Creating…' : 'Create incident'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
