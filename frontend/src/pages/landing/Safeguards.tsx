import { useId, useRef } from 'react'
import { motion } from 'motion/react'
import { variants } from '../../motion/presets'
import { useReducedMotion } from '../../motion/useReducedMotion'
import { useSeenOnce } from './useSeenOnce'

interface Fact {
  text: string
  /** The figure at a glance, in mono. The sentence already says it, so it is hidden from screen readers. */
  tag?: string
}

interface Group {
  title: string
  facts: Fact[]
}

// Each statement is something this deployment does today, checked against the code:
// backend/internal/{invite,auth,session,ratelimit,incident,audit}, backend/server.go,
// .github/workflows/{audit-verify,backup,zap-baseline}.yml and frontend/public/_headers.
// Change one only after checking the code still backs it.
const GROUPS: Group[] = [
  {
    title: 'Getting in',
    facts: [
      {
        text: 'Accounts are by invitation only. There is no public registration.',
        tag: 'invite only',
      },
      { text: 'Passwords are stored only as bcrypt hashes.', tag: 'bcrypt' },
      {
        text: 'A session is a random token in an HttpOnly cookie, out of reach of page scripts. The database keeps only a hash of it, and it ends after 7 days.',
        tag: '7 days',
      },
      {
        text: 'After 10 failed sign-ins from one address in 15 minutes, further attempts are turned away until the window clears. Invite links, reset links and password changes have limits of their own.',
        tag: '10 / 15 min',
      },
    ],
  },
  {
    title: 'Seeing only what you should',
    facts: [
      {
        text: 'Three roles: reporter, analyst and admin. Reporters see only their own incidents, and the server checks this on every request.',
      },
    ],
  },
  {
    title: 'Keeping a record',
    facts: [
      {
        text: 'Sign-ins, invites, role changes and password changes go into an audit log. Each entry is hash-chained to the one before, and the database refuses edits and deletions.',
      },
      {
        text: 'Every 6 hours a scheduled check verifies the chain and records its latest hash outside the database, so a rewritten history would not match.',
        tag: 'every 6 h',
      },
      {
        text: 'Backups run nightly, are encrypted before they are stored, and are kept for 90 days in two places: GitHub and Backblaze.',
        tag: '90 days',
      },
    ],
  },
  {
    title: 'Checked from outside',
    facts: [
      {
        text: 'Strict security headers: scripts, styles and data requests may come only from the site itself, and no other site may frame it.',
      },
      {
        text: 'Every Monday an automated passive scan checks the live site’s headers, cookies and responses.',
        tag: 'weekly',
      },
    ],
  },
]

/** How SentinelOps protects data: only facts this deployment backs, grouped by what they guard. */
export function Safeguards() {
  const reduced = useReducedMotion()
  const titleId = useId()
  const gridRef = useRef<HTMLDivElement>(null)
  const seen = useSeenOnce(gridRef)
  const fadeUp = variants('fadeUp', reduced)

  return (
    <section className="landing-section landing-guard" aria-labelledby={titleId}>
      <h2 id={titleId} className="landing-h2">
        How it protects your data
      </h2>
      <p className="landing-body landing-guard-lede">
        This is how the running deployment works today. The source is public, so every line here
        can be checked against it.
      </p>

      <motion.div
        ref={gridRef}
        className="landing-guard-grid"
        initial="initial"
        animate={seen || reduced ? 'show' : 'initial'}
        variants={variants('stagger', reduced)}
      >
        {GROUPS.map((group) => (
          <motion.div key={group.title} className="landing-guard-group" variants={fadeUp}>
            <h3 className="landing-h3">{group.title}</h3>
            <ul className="landing-facts">
              {group.facts.map((fact) => (
                <li key={fact.text} className="landing-fact">
                  <span>{fact.text}</span>
                  {fact.tag ? (
                    <span className="landing-fact-tag" aria-hidden="true">
                      {fact.tag}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
