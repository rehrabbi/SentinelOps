import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '../brand/Logo'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Toaster } from '../ui/Toast'
import './shell.css'
import './PublicShell.css'

const REPO = 'https://github.com/rehrabbi/SentinelOps'

export interface PublicShellProps {
  children: ReactNode
  /**
   * The header's call to action, at the far end from the logo: the landing page passes its
   * "Sign in" link; the sign-in page itself passes nothing.
   */
  headerAction?: ReactNode
}

/**
 * The frame for signed-out pages (landing, sign in, invite, reset, privacy): logo, an optional
 * header action, the page, and a footer with the credit, source links, privacy and the theme toggle.
 */
export function PublicShell({ children, headerAction }: PublicShellProps) {
  return (
    <div className="shell public-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Link to="/" className="shell-brand" aria-label="SentinelOps home">
          <Logo variant="lockup" size={28} />
        </Link>
        {headerAction ? <div className="public-header-action">{headerAction}</div> : null}
      </header>
      <main id="main" className="shell-main public-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="public-footer">
        <p className="public-credit">
          Built and operated by <a href="https://github.com/rehrabbi">rehrabbi</a> as an open-source
          project.
        </p>
        <nav className="public-footer-links" aria-label="Footer">
          <ul>
            <li>
              <a href={REPO}>Source on GitHub</a>
            </li>
            <li>
              <a href={`${REPO}/releases`}>Releases</a>
            </li>
            <li>
              <Link to="/privacy">Privacy</Link>
            </li>
          </ul>
        </nav>
        <ThemeToggle />
      </footer>
      <Toaster />
    </div>
  )
}
