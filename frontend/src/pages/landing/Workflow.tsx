import { useId, useRef } from 'react'
import { motion } from 'motion/react'
import type { IncidentSeverity, IncidentStatus } from '../../api'
import { variants } from '../../motion/presets'
import { useReducedMotion } from '../../motion/useReducedMotion'
import { SeverityBadge, StatusBadge } from '../../ui/Badge'
import { useSeenOnce } from './useSeenOnce'

const SEVERITIES: IncidentSeverity[] = ['low', 'medium', 'high', 'critical']

interface Step {
  title: string
  body: string
  /** The badges the step is about, as the app itself draws them. */
  specimen: { severities?: IncidentSeverity[]; statuses?: IncidentStatus[] }
}

const STEPS: Step[] = [
  {
    title: 'Report it',
    body: 'Anyone with an account can open an incident: a title, what happened, and how bad it is.',
    specimen: { severities: SEVERITIES },
  },
  {
    title: 'Work it',
    body: 'Analysts and admins see every incident in one list. Setting one to investigating tells the team someone is looking at it.',
    specimen: { statuses: ['open', 'investigating'] },
  },
  {
    title: 'Close it',
    body: 'Mark it resolved once the fix is in, and closed when there is nothing left to do.',
    specimen: { statuses: ['resolved', 'closed'] },
  },
]

/** What SentinelOps does: an incident's path from report to closed, with the app's own badges. */
export function Workflow() {
  const reduced = useReducedMotion()
  const titleId = useId()
  const listRef = useRef<HTMLOListElement>(null)
  const seen = useSeenOnce(listRef)
  const fadeUp = variants('fadeUp', reduced)
  const state = seen || reduced ? 'show' : 'initial'

  return (
    <section className="landing-section landing-flow" aria-labelledby={titleId}>
      <div className="landing-flow-intro">
        <h2 id={titleId} className="landing-h2">
          From report to resolved
        </h2>
        <p className="landing-body">
          Every incident carries a severity and a status, shown with the same words, colours and
          marks wherever it appears. Nobody has to ask how bad it is or where it stands.
        </p>
      </div>

      <motion.ol
        ref={listRef}
        className="landing-flow-steps"
        initial="initial"
        animate={state}
        variants={variants('stagger', reduced)}
      >
        {STEPS.map((step) => (
          <motion.li key={step.title} className="landing-flow-step" variants={fadeUp}>
            <h3 className="landing-h3">{step.title}</h3>
            <p className="landing-body">{step.body}</p>
            <div className="landing-specimen">
              {step.specimen.severities?.map((s) => <SeverityBadge key={s} severity={s} />)}
              {step.specimen.statuses?.map((s, i) => (
                <span key={s} className="landing-specimen-item">
                  {i > 0 ? (
                    <svg className="landing-arrow" viewBox="0 0 16 8" aria-hidden="true" focusable="false">
                      <path d="M0 4H14M11 1L14 4L11 7" />
                    </svg>
                  ) : null}
                  <StatusBadge status={s} />
                </span>
              ))}
            </div>
          </motion.li>
        ))}
      </motion.ol>

      <p className="landing-body landing-roles">
        Reporters see the incidents they opened. Analysts and admins see all of them, and only
        admins invite people and change roles.
      </p>
    </section>
  )
}
