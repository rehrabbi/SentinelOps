import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import type { User } from '../api'
import { Logo } from '../brand/Logo'
import { transition } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Button } from '../ui/Button'
import { Toaster } from '../ui/Toast'
import './shell.css'
import './AppShell.css'

export interface AppShellProps {
  /** The signed-in user: names the user menu and decides whether Users appears. */
  user: User
  /**
   * Ends the session. The shell shows "Logging out…" until a returned promise settles; the
   * caller does the work (the API call, clearing auth state, where to go next).
   */
  onLogout: () => void | Promise<void>
  children: ReactNode
}

const ROLE_LABEL: Record<User['role'], string> = {
  reporter: 'Reporter',
  analyst: 'Analyst',
  admin: 'Admin',
}

function UserMenu({ user, onLogout }: Pick<AppShellProps, 'user' | 'onLogout'>) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const reduced = useReducedMotion()
  const panelId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // While open: Escape closes and hands focus back to the button; a click elsewhere closes.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  async function handleLogout() {
    setBusy(true)
    try {
      await onLogout()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="user-menu"
      ref={wrapperRef}
      onBlur={(event) => {
        // Tabbing out of the menu closes it, so it never hangs open behind the focus.
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="user-menu-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-menu-name">{user.fullName}</span>
        <span className="visually-hidden"> (account menu)</span>
        <svg className="user-menu-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            className="user-menu-panel"
            // Focusable so a click on its text keeps focus inside (and the menu open).
            tabIndex={-1}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: transition('enter', reduced) }}
            exit={{ opacity: 0, transition: transition('exit', reduced) }}
          >
            <div className="user-menu-who">
              <p className="user-menu-fullname">{user.fullName}</p>
              <p className="user-menu-email">
                {/* If a long address must wrap, prefer the line break before the @. */}
                {user.email.split('@')[0]}
                {user.email.includes('@') ? (
                  <>
                    <wbr />@{user.email.slice(user.email.indexOf('@') + 1)}
                  </>
                ) : null}
              </p>
              <p className="user-menu-role">{ROLE_LABEL[user.role]}</p>
            </div>
            <div className="user-menu-section">
              <p className="user-menu-heading" aria-hidden="true">
                Theme
              </p>
              <ThemeToggle />
            </div>
            <div className="user-menu-section">
              <Button variant="secondary" className="user-menu-logout" busy={busy} onClick={handleLogout}>
                {busy ? 'Logging out…' : 'Log out'}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/**
 * The frame for signed-in screens: a header with the logo, the main nav (Incidents, Users for
 * admins, Account) and the user menu (theme, Log out); a skip link; the page; the toaster.
 */
export function AppShell({ user, onLogout, children }: AppShellProps) {
  return (
    <div className="shell app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="shell-brand app-brand" aria-label="SentinelOps home">
            <Logo variant="lockup" size={28} className="app-brand-lockup" />
            <Logo variant="mark" size={28} className="app-brand-mark" />
          </Link>
          <nav className="app-nav" aria-label="Main">
            <ul>
              <li>
                <NavLink to="/" end>
                  Incidents
                </NavLink>
              </li>
              {user.role === 'admin' ? (
                <li>
                  <NavLink to="/admin">Users</NavLink>
                </li>
              ) : null}
              <li>
                <NavLink to="/account">Account</NavLink>
              </li>
            </ul>
          </nav>
          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </header>
      <main id="main" className="shell-main app-main" tabIndex={-1}>
        {children}
      </main>
      <Toaster />
    </div>
  )
}
