import { useId, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { variants } from '../../motion/presets'
import { useReducedMotion } from '../../motion/useReducedMotion'
import { Button } from '../../ui/Button'
import { HeroEye } from './HeroEye'

// The range rings behind the eye: the pupil's diamond repeated outwards, like a radar's rings.
const RINGS = [150, 260, 390, 540, 710]
const diamond = (r: number) => `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`

/**
 * The top of the landing page: the heading, one line on what SentinelOps is, the two calls to
 * action ("Sign in" and "Have an invite?"), and the eye keeping watch over its range rings.
 */
export function Hero() {
  const reduced = useReducedMotion()
  const [inviteOpen, setInviteOpen] = useState(false)
  // Counts openings, so the panel's entrance replays each time it opens.
  const [opened, setOpened] = useState(0)
  const panelId = useId()
  const titleId = useId()
  const fadeUp = variants('fadeUp', reduced)

  function toggleInvite() {
    if (!inviteOpen) setOpened((n) => n + 1)
    setInviteOpen((open) => !open)
  }

  return (
    <section className="landing-hero" aria-labelledby={titleId}>
      {/* Decoration: the range rings, centred on the eye, and the eye itself. */}
      <div className="landing-hero-eye" aria-hidden="true">
        <svg className="landing-hero-rings" viewBox="-760 -760 1520 1520" focusable="false">
          {RINGS.map((r) => (
            <path key={r} d={diamond(r)} />
          ))}
        </svg>
        <HeroEye />
      </div>

      <motion.div
        className="landing-hero-copy"
        initial="initial"
        animate="show"
        variants={variants('stagger', reduced)}
      >
        <motion.h1 id={titleId} className="landing-title" variants={fadeUp}>
          Incident tracking, watched closely.
        </motion.h1>
        <motion.p className="landing-lede" variants={fadeUp}>
          Report an incident with its severity and follow it from open to closed. Accounts are by
          invitation only.
        </motion.p>
        <motion.div className="landing-actions" variants={fadeUp}>
          <Link to="/signin" className="ui-btn ui-btn-primary landing-cta">
            Sign in
          </Link>
          <Button
            variant="secondary"
            className="landing-cta"
            aria-expanded={inviteOpen}
            aria-controls={panelId}
            onClick={toggleInvite}
          >
            Have an invite?
          </Button>
        </motion.div>

        <div id={panelId} className="landing-invite" hidden={!inviteOpen}>
          <motion.div key={opened} initial="initial" animate="show" variants={fadeUp}>
            <p>
              Accounts are by invitation only. An administrator creates yours and sends you a
              one-time link. Open it within 24 hours to choose your name and a password, and
              you&rsquo;re signed in.
            </p>
            <p>If the link has expired, ask the administrator for a new one.</p>
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}
