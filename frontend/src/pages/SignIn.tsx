import { useState, type FormEvent } from 'react'
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

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string }

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Clearing the old message first means a repeated error is announced again.
    setStatus({ kind: 'submitting' })
    try {
      const user = await login(email, password)
      onLoggedIn(user)
      navigate('/', { replace: true })
    } catch (err) {
      // api.ts owns the wording: one message for a wrong email or password alike (it never says
      // which, so it cannot reveal whether an account exists), and the wait after too many tries.
      setStatus({ kind: 'error', message: err instanceof ApiError ? err.message : UNREACHABLE })
    }
  }

  const busy = status.kind === 'submitting'

  return (
    <AuthShell
      title="Sign in"
      lede="Use the email address your invite was sent to."
      note="New here? Accounts are by invitation. Ask an administrator for an invite link."
    >
      {sessionEnded ? (
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
      <form className="auth-form" method="post" onSubmit={handleSubmit}>
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
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {status.kind === 'error' ? <AuthError message={status.message} /> : null}
        <Button type="submit" busy={busy} className="auth-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
