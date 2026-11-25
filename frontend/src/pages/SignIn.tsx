import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { login, ApiError, type User } from '../api'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { AuthError } from './auth/AuthError'
import { AuthShell } from './auth/AuthShell'
import './SignIn.css'

export interface SignInProps {
  /** Receives the signed-in user; App keeps it and the page then goes home. */
  onLoggedIn: (user: User) => void
  /** The person is here because their session ended mid-use: say so above the form. */
  sessionEnded?: boolean
}

// credentials: the server refused the email and password (it never says which), so the error
// belongs to both fields. Otherwise (too many attempts, the API unreachable) it is about the form.
type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string; credentials: boolean; attempt: number }

// fetch itself failed (offline, DNS, the API down): there is no status to show.
const UNREACHABLE = "Couldn't reach SentinelOps. Check your connection and try again."

/**
 * The sign-in moment. The eye wakes, one ping leaves the pupil, a scan passes across the page and
 * traces the top of the form as it goes. All of it plays around the form, which is there and usable
 * from the first frame. With reduced motion the scene simply fades in (auth/AuthShell.css).
 */
export function SignIn({ onLoggedIn, sessionEnded = false }: SignInProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // The "session ended" notice has done its job once the person tries again; dropping it then
  // also means two alerts are never on the page together.
  const [noticeShown, setNoticeShown] = useState(sessionEnded)
  const formRef = useRef<HTMLFormElement>(null)
  const errorId = useId()

  // After a failed attempt the button was disabled for a moment, which drops focus. Wrong
  // credentials: back to the password, selected, ready to retype (the email is rarely the
  // mistake, and it is one Shift+Tab away). Anything else: back to the button, to try again.
  const attempt = status.kind === 'error' ? status.attempt : 0
  const credentials = status.kind === 'error' && status.credentials
  useEffect(() => {
    if (attempt === 0) return
    const form = formRef.current
    if (credentials) {
      const password = form?.querySelector<HTMLInputElement>('input[name="password"]')
      password?.focus()
      password?.select()
    } else {
      form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
    }
  }, [attempt, credentials])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Clearing the old message first means a repeated error is announced again.
    setStatus({ kind: 'submitting' })
    setNoticeShown(false)
    try {
      const user = await login(email, password)
      onLoggedIn(user)
      navigate('/', { replace: true })
    } catch (err) {
      // api.ts owns the wording: one message for a wrong email or password alike (it never says
      // which, so it cannot reveal whether an account exists), and the wait after too many tries.
      setStatus({
        kind: 'error',
        message: err instanceof ApiError ? err.message : UNREACHABLE,
        credentials: err instanceof ApiError && err.status === 401,
        attempt: attempt + 1,
      })
    }
  }

  const busy = status.kind === 'submitting'
  // Wrong credentials mark both fields invalid and point both at the message.
  const fieldError = credentials ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {}

  return (
    <AuthShell
      title="Sign in"
      lede="Use the email address your invite was sent to."
      note="New here? Accounts are by invitation. Ask an administrator for an invite link."
    >
      {noticeShown ? (
        <p className="signin-notice" role="alert">
          <svg className="signin-notice-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 6v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="10.4" r="0.85" fill="currentColor" />
          </svg>
          <span>Your session ended. Sign in again.</span>
        </p>
      ) : null}

      {/* method="post": should the script ever fail to take over, the browser posts the form
          instead of putting the password in the address bar. */}
      <form ref={formRef} className="auth-form" method="post" onSubmit={handleSubmit}>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...fieldError}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          {...fieldError}
        />
        {status.kind === 'error' ? <AuthError id={errorId} message={status.message} /> : null}
        <Button type="submit" busy={busy} className="auth-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
