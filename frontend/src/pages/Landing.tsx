import { useId } from 'react'
import { Link } from 'react-router'
import { Logo } from '../brand/Logo'
import { Hero } from './landing/Hero'
import { Safeguards } from './landing/Safeguards'
import { Workflow } from './landing/Workflow'
import './Landing.css'

/**
 * The public landing page, for visitors who are signed out. It sits in PublicShell, which supplies
 * the header (logo, "Sign in") and the footer (credit, source, releases, privacy, theme).
 */
export function Landing() {
  const closeId = useId()
  return (
    <div className="landing">
      <Hero />
      <Workflow />
      <Safeguards />

      <section className="landing-section landing-close" aria-labelledby={closeId}>
        <Logo variant="mark" size={40} className="landing-close-mark" />
        <div className="landing-close-copy">
          <h2 id={closeId} className="landing-h2">
            Already have an account?
          </h2>
          <p className="landing-body">No account yet? Ask an administrator for an invite.</p>
        </div>
        <Link to="/signin" className="ui-btn ui-btn-primary landing-cta">
          Sign in
        </Link>
      </section>
    </div>
  )
}
