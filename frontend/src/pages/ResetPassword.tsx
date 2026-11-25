import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { acceptPasswordReset } from '../api'
import { variants } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { AuthError } from './auth/AuthError'
import { AuthShell } from './auth/AuthShell'
import { errorMessage, type FormStatus } from './formStatus'

const MISMATCH = 'The passwords do not match'

// ResetPassword turns a reset link (/reset#<token>) into a new password. Like an invite link, the
// token sits after "#", which browsers never send to a server, and is wiped from the address bar as
// soon as it is read.
//
// Using it ends every session of that account, which may include the one this browser holds, so
// afterwards the app asks the server who is logged in.
export function ResetPassword({ onSessionChanged }: { onSessionChanged: () => void }) {
  const reduced = useReducedMotion()
  const [token] = useState(() => window.location.hash.slice(1))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' })
  const doneRef = useRef<HTMLDivElement>(null)
  const doneMessageId = useId()

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // The submit button that had focus is gone once the confirmation replaces the form, so focus would
  // fall to the page. Move it to the confirmation: it is named and described, so a screen reader
  // reads "Password reset" and the message as focus lands.
  const done = status.kind === 'done'
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  if (!token) {
    return (
      <AuthShell quiet title="Reset your password">
        <div className="auth-actions">
          <p className="auth-text">
            This page needs the full reset link. Open the link an administrator sent you.
          </p>
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
      await acceptPasswordReset(token, password)
      setStatus({ kind: 'done' })
      onSessionChanged()
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err, 'Something went wrong') })
    }
  }

  const busy = status.kind === 'submitting'

  // One shell for both states, so the confirmation replaces only the panel's content: the eye and
  // rings do not start over.
  return (
    <AuthShell
      quiet
      title={done ? 'Password reset' : 'Reset your password'}
      lede={done ? undefined : 'Choose a new password for your account.'}
    >
      {done ? (
        // The swap from the form is an interactive state change, so it uses Motion's presets.
        <motion.div
          ref={doneRef}
          className="auth-actions auth-confirmation"
          role="group"
          aria-label="Password reset"
          aria-describedby={doneMessageId}
          tabIndex={-1}
          variants={variants('fadeUp', reduced)}
          initial="initial"
          animate="show"
        >
          <p className="auth-text" id={doneMessageId}>
            Your password was changed and every session of your account was logged out.
          </p>
          <Link to="/signin" replace className="auth-link">
            Sign in with your new password
          </Link>
        </motion.div>
      ) : (
        <form className="auth-form" method="post" onSubmit={handleSubmit}>
          <Field
            label="New password"
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
            label="Confirm new password"
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
            {busy ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
