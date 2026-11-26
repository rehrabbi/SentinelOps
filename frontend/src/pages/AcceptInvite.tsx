import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { acceptInvite, login, ApiError, type User } from '../api'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { AuthError } from './auth/AuthError'
import { AuthShell } from './auth/AuthShell'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }

const MISMATCH = 'The passwords do not match'

// AcceptInvite turns an invite link (/invite#<token>) into an account: the invitee picks their name
// and password, then is logged in. The token comes after "#", which browsers never send to a server,
// and is wiped from the address bar as soon as it is read, so it does not linger in history.
export function AcceptInvite({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const navigate = useNavigate()
  const [token] = useState(() => window.location.hash.slice(1))
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  if (!token) {
    return (
      <AuthShell quiet title="Accept your invite">
        <div className="auth-actions">
          <p className="auth-text">This page needs the full invite link. Open the link you were sent.</p>
          <Link to="/signin" className="auth-link">
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password !== confirm) {
      setMismatch(true)
      // Take the person to the field that needs fixing.
      const confirmField = e.currentTarget.elements.namedItem('confirm-password') as HTMLElement | null
      confirmField?.focus()
      return
    }
    setStatus({ kind: 'submitting' })
    try {
      const created = await acceptInvite(token, fullName, password)
      const user = await login(created.email, password)
      onLoggedIn(user)
      navigate('/', { replace: true })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong'
      setStatus({ kind: 'error', message })
    }
  }

  const busy = status.kind === 'submitting'

  return (
    <AuthShell quiet title="Accept your invite" lede="Choose your name and a password to create your account.">
      <form className="auth-form" method="post" onSubmit={handleSubmit}>
        <Field
          label="Full name"
          type="text"
          name="name"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          minLength={12}
          hint="At least 12 characters."
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setMismatch(false)
          }}
        />
        <Field
          label="Confirm password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          required
          minLength={12}
          error={mismatch ? MISMATCH : undefined}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setMismatch(false)
          }}
        />
        {status.kind === 'error' ? <AuthError message={status.message} /> : null}
        <Button type="submit" busy={busy} className="auth-submit">
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  )
}
