import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { changePassword, logoutEverywhere, type User } from '../api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Field } from '../ui/Field'
import { errorMessage, type FormStatus } from './formStatus'
import '../ui/Text.css'
import './Account.css'

// AccountPage is where people keep control of their own account: change the password, or end
// every session at once if a device was lost.
export function AccountPage({ user, onLoggedOut }: { user: User; onLoggedOut: () => void }) {
  return (
    <div className="account-page">
      <div className="account-head">
        <h1 className="ui-page-title">Account</h1>
        <p className="account-lede">
          Signed in as <span className="account-mono">{user.email}</span>
        </p>
      </div>
      <ChangePasswordForm email={user.email} />
      <LogoutEverywhere onLoggedOut={onLoggedOut} />
    </div>
  )
}

function ChangePasswordForm({ email }: { email: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const errorId = useId()
  const doneRef = useRef<HTMLParagraphElement>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' })

  // The submit button is disabled while the request runs, which drops focus to the page. When the
  // answer arrives, put focus where the person needs to read or act next.
  const kind = status.kind
  useEffect(() => {
    if (kind === 'done') doneRef.current?.focus()
    if (kind === 'error') {
      const target = mismatch ? '#account-confirm' : 'button[type="submit"]'
      formRef.current?.querySelector<HTMLElement>(target)?.focus()
    }
  }, [kind, mismatch])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // A typo in a password nobody can see would lock its owner out, so the new one is typed
    // twice. The server does not need the copy.
    if (next !== confirm) {
      setMismatch(true)
      setStatus({ kind: 'error', message: 'The new passwords do not match' })
      return
    }
    setMismatch(false)
    setStatus({ kind: 'submitting' })
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setStatus({ kind: 'done' })
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err, 'Something went wrong') })
    }
  }

  const submitting = status.kind === 'submitting'

  return (
    <Card as="section" className="account-card" aria-labelledby="account-password-title">
      <h2 id="account-password-title" className="account-card-title">
        Change password
      </h2>
      <form ref={formRef} className="account-form" onSubmit={handleSubmit}>
        {/* Lets a password manager tie the new password to this account. */}
        <input type="email" name="username" value={email} readOnly hidden autoComplete="username" />
        <Field
          label="Current password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          aria-describedby={status.kind === 'error' && !mismatch ? errorId : undefined}
          aria-invalid={status.kind === 'error' && !mismatch ? true : undefined}
        />
        <Field
          label="New password"
          hint="At least 12 characters."
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={12}
          autoComplete="new-password"
        />
        <Field
          id="account-confirm"
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={12}
          autoComplete="new-password"
          error={mismatch && status.kind === 'error' ? status.message : undefined}
        />
        {status.kind === 'error' && !mismatch && (
          <p id={errorId} className="ui-error-text" role="alert">
            {status.message}
          </p>
        )}
        {status.kind === 'done' && (
          <p ref={doneRef} tabIndex={-1} className="account-success" role="status">
            Password changed. This device stays signed in; your other sessions were logged out.
          </p>
        )}
        <div className="account-actions">
          <Button type="submit" busy={submitting}>
            {submitting ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function LogoutEverywhere({ onLoggedOut }: { onLoggedOut: () => void }) {
  const navigate = useNavigate()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' })

  const kind = status.kind
  useEffect(() => {
    if (kind === 'error') buttonRef.current?.querySelector('button')?.focus()
  }, [kind])

  async function handleClick() {
    setStatus({ kind: 'submitting' })
    try {
      await logoutEverywhere()
      onLoggedOut()
      navigate('/signin', { replace: true })
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err, 'Something went wrong') })
    }
  }

  const submitting = status.kind === 'submitting'

  return (
    <Card as="section" className="account-card" aria-labelledby="account-logout-title">
      <h2 id="account-logout-title" className="account-card-title">
        Log out everywhere
      </h2>
      <p className="account-text">
        Ends every session of yours, on every device, including this one. Use it if a device was
        lost or someone else may have your password.
      </p>
      {status.kind === 'error' && (
        <p className="ui-error-text" role="alert">
          {status.message}
        </p>
      )}
      <div ref={buttonRef} className="account-actions">
        <Button variant="danger" onClick={handleClick} busy={submitting}>
          {submitting ? 'Logging out…' : 'Log out everywhere'}
        </Button>
      </div>
    </Card>
  )
}
