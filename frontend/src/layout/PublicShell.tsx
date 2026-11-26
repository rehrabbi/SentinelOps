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
    <div className="ui-shell ui-public-shell">
      <a className="ui-skip-link" href="#main">
        Skip to content
      </a>
      <header className="ui-public-header">
        <Link to="/" className="ui-shell-brand" aria-label="SentinelOps home">
          <Logo variant="lockup" size={28} />
        </Link>
        {headerAction ? <div className="ui-public-header-action">{headerAction}</div> : null}
      </header>
      <main id="main" className="ui-shell-main ui-public-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="ui-public-footer">
        <p className="ui-public-credit">
          Built and operated by <a href="https://github.com/rehrabbi">rehrabbi</a> as an open-source
          project.
        </p>
        <nav className="ui-public-footer-links" aria-label="Footer">
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
