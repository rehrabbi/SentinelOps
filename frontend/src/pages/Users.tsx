import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import {
  createInvite,
  createPasswordReset,
  getUsers,
  updateUserRole,
  ApiError,
  type IssuedInvite,
  type IssuedReset,
  type Role,
  type User,
} from '../api'
import { transition } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { Spinner } from '../ui/Spinner'
import { toast } from '../ui/toast-store'
import { OneTimeLink } from './OneTimeLink'
import '../ui/Text.css'
import './Users.css'

// The load state for the user list: exactly one of these three.
type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; users: User[] }

const ROLES: Role[] = ['reporter', 'analyst', 'admin']

// What each role can really do, from the API: reporters see and change only their own incidents;
// analysts see and change every incident; only admins reach the user, invite and reset endpoints.
const ROLE_DESCRIPTION: Record<Role, string> = {
  reporter: 'Reports incidents and sees only their own.',
  analyst: 'Sees and updates every incident.',
  admin: 'Does what an analyst does, and manages users, invites and password resets.',
}

// Why a reset link could not be made. When it was to replace a link already shown, also say what
// became of that one. The server issues a link in one transaction, so a refusal it answered left
// the earlier link working. If it could not be reached, the request may or may not have arrived,
// so nobody knows whether the earlier link still works.
function resetFailed(err: unknown, replacing: boolean): string {
  if (err instanceof ApiError) {
    return replacing
      ? `${err.message.replace(/[.!?]$/, '')}. The link shown before was not replaced: it still works until it expires.`
      : err.message
  }
  return replacing
    ? "Couldn't create a new reset link. The link shown before may have stopped working, so create a new one before you send it."
    : 'Could not create the reset link'
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function RoleOptions() {
  return (
    <>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {cap(r)}
        </option>
      ))}
    </>
  )
}

// A reset link that is on screen: whose row it belongs to, and the server's answer.
type ShownReset = { userId: string; reset: IssuedReset }

/**
 * The admin screen: invite someone, then see everyone and change roles or issue a reset link.
 * Reaching it already requires the admin role, but that is routing convenience: the API is the
 * actual control, and it answers 403 to anyone else.
 */
export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const reduced = useReducedMotion()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  // At most one reset link is on screen: issuing another, or hiding it, drops the old one.
  const [shownReset, setShownReset] = useState<ShownReset | null>(null)

  const load = useCallback(() => {
    setList({ kind: 'loading' })
    getUsers()
      .then((users) => setList({ kind: 'ready', users }))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : 'Failed to load users'
        setList({ kind: 'error', message })
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Replace one user in place after a role change, so we never refetch.
  function handleUpdated(updated: User) {
    setList((prev) =>
      prev.kind === 'ready'
        ? { kind: 'ready', users: prev.users.map((u) => (u.id === updated.id ? updated : u)) }
        : prev,
    )
  }

  // A reset link lets whoever holds it choose this person's password, so it is shown once, in the
  // row, and handed over by the admin like an invite. Throws on failure; the row shows why.
  async function issueReset(userId: string) {
    // Drop whatever link is showing before asking for a new one, so the old link is never on
    // screen beside a request for its replacement.
    setShownReset(null)
    const reset = await createPasswordReset(userId)
    setShownReset({ userId, reset })
  }

  return (
    <div className="users-page">
      <div className="users-head">
        <h1 className="ui-page-title">Users</h1>
        <p className="users-lede">
          Accounts exist only by invitation. There is no sign-up, and no email is sent.
        </p>
      </div>

      <InviteForm />

      <section className="users-section" aria-labelledby="users-list-title">
        <h2 id="users-list-title" className="ui-section-label">
          Everyone with an account
        </h2>
        {list.kind === 'loading' && (
          <p className="users-loading">
            <Spinner label="Loading users" />
            <span aria-hidden="true">Loading users…</span>
          </p>
        )}
        {list.kind === 'error' && (
          <div className="users-load-error">
            <p className="ui-error-text" role="alert">
              {list.message}
            </p>
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
        )}
        {list.kind === 'ready' && list.users.length === 0 && (
          <EmptyState
            headingLevel={3}
            title="No users yet"
            body="Invite someone above and their account shows up here once they accept."
          />
        )}
        {list.kind === 'ready' && list.users.length > 0 && (
          <motion.ul
            className="users-list"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1, transition: transition('enter', reduced) }}
          >
            {list.users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onUpdated={handleUpdated}
                onIssueReset={issueReset}
                shownReset={shownReset?.userId === u.id ? shownReset.reset : null}
                onHideReset={() => setShownReset(null)}
              />
            ))}
          </motion.ul>
        )}
      </section>
    </div>
  )
}

// One row. The select holds a draft choice; Save commits it. Granting admin is privileged enough
// to deserve a deliberate second action rather than firing on change like the incident status.
function UserRow({
  user,
  isSelf,
  onUpdated,
  onIssueReset,
  shownReset,
  onHideReset,
}: {
  user: User
  isSelf: boolean
  onUpdated: (user: User) => void
  onIssueReset: (userId: string) => Promise<void>
  shownReset: IssuedReset | null
  onHideReset: () => void
}) {
  const errorId = useId()
  const selfNoteId = useId()
  const draftId = useId()
  const selectRef = useRef<HTMLSelectElement>(null)
  const resetButtonRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLTextAreaElement>(null)
  const wasSaving = useRef(false)
  const wasIssuing = useRef(false)
  const [choice, setChoice] = useState<Role>(user.role)
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A disabled select (and the Save button that just ran) drops focus to the page. Once saving is
  // over, give focus to the select, unless the person has already moved on to something else.
  useEffect(() => {
    if (wasSaving.current && !saving) {
      const active = document.activeElement
      // The Save button that was just pressed is disabled again (nothing left to save); a browser
      // drops focus from it, jsdom leaves it there. Either way it is not a place to stay.
      const stranded = !active || active === document.body || (active as HTMLButtonElement).disabled
      if (stranded) selectRef.current?.focus()
    }
    wasSaving.current = saving
  }, [saving])

  // A failed reset: the button was disabled while it ran, which drops focus. Put it back on the
  // button, beside the message that says what happened.
  useEffect(() => {
    if (wasIssuing.current && !issuing && error) {
      const active = document.activeElement
      const stranded = !active || active === document.body || (active as HTMLButtonElement).disabled
      if (stranded) resetButtonRef.current?.querySelector('button')?.focus()
    }
    wasIssuing.current = issuing
  }, [issuing, error])

  // When this row's link appears, put the cursor on it so it is read out and ready to copy.
  const hasLink = shownReset !== null
  useEffect(() => {
    if (hasLink) linkRef.current?.focus()
  }, [hasLink])

  // Nothing to save until the draft differs from what the server told us.
  const dirty = choice !== user.role

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateUserRole(user.id, choice)
      onUpdated(updated)
      toast(`${user.fullName} is now ${updated.role}`, 'success')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed')
      // Snap the control back to the truth we know, so the screen never shows a role the server
      // refused.
      setChoice(user.role)
    } finally {
      setSaving(false)
    }
  }

  async function issueReset() {
    // A link already on screen leaves it as the request starts (see UsersPage.issueReset).
    const replacing = shownReset !== null
    setIssuing(true)
    setError(null)
    try {
      await onIssueReset(user.id)
    } catch (err) {
      setError(resetFailed(err, replacing))
    } finally {
      setIssuing(false)
    }
  }

  function hideLink() {
    onHideReset()
    resetButtonRef.current?.querySelector('button')?.focus()
  }

  const describedBy = [error ? errorId : null, isSelf ? selfNoteId : null, dirty && !isSelf ? draftId : null].filter(Boolean).join(' ')

  return (
    <li className="users-row" aria-busy={saving || issuing || undefined}>
      <div className="users-main">
        <p className="users-name">
          {user.fullName}
          {isSelf && <span className="users-self"> (you)</span>}
        </p>
        <p className="users-email">{user.email}</p>
        {isSelf && (
          <p id={selfNoteId} className="users-note">
            You can't change your own role, so there is always one admin left.
          </p>
        )}
        {dirty && !isSelf && (
          <p id={draftId} className="users-note">
            Currently {cap(user.role)}. Not saved until you press Save.
          </p>
        )}
        {error && (
          <p id={errorId} className="ui-error-text" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="users-controls">
        <select
          ref={selectRef}
          name="role"
          className={dirty && !isSelf ? 'users-select users-select-changed' : 'users-select'}
          aria-label={`Role for ${user.fullName}`}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          value={choice}
          disabled={isSelf || saving}
          onChange={(e) => setChoice(e.target.value as Role)}
        >
          <RoleOptions />
        </select>
        {!isSelf && (
          <Button
            variant="secondary"
            onClick={save}
            disabled={!dirty}
            busy={saving}
            aria-label={`Save role for ${user.fullName}`}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
        {!isSelf && (
          <div ref={resetButtonRef}>
            <Button
              variant="ghost"
              onClick={issueReset}
              busy={issuing}
              aria-describedby={error ? errorId : undefined}
              aria-label={`Reset password for ${user.fullName}`}
            >
              {issuing ? 'Creating…' : 'Reset password'}
            </Button>
          </div>
        )}
      </div>
      {shownReset && (
        <div className="users-row-link">
          <OneTimeLink
            key={shownReset.token}
            ref={linkRef}
            label="Password reset link"
            link={`${window.location.origin}/reset#${shownReset.token}`}
            expiresAt={shownReset.expiresAt}
            summary={
              <>
                Reset link for <strong className="users-mono">{shownReset.email}</strong>. Whoever
                opens it can choose a new password for this account, and doing so logs them out
                everywhere. A new link replaces any earlier one. It lasts 1 hour.
              </>
            }
            onHide={hideLink}
          />
        </div>
      )}
      {/* Always in the page so a screen reader hears the text appear. */}
      <span role="status" className="visually-hidden">
        {saving ? 'Saving…' : ''}
      </span>
    </li>
  )
}

// InviteForm issues a one-time invite and shows its link, once. Accounts exist only through
// invites: there is no open sign-up, so nobody can learn which emails have accounts by trying to
// register them.
function InviteForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const linkRef = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('reporter')
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'error'; message: string }
    | { kind: 'issued'; invite: IssuedInvite }
  >({ kind: 'idle' })

  // A new link: put the cursor on it. A failed send: the button was disabled for a moment, which
  // drops focus, so put it back on the button to fix the text and try again.
  const kind = status.kind
  useEffect(() => {
    if (kind === 'issued') linkRef.current?.focus()
    if (kind === 'error') formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
  }, [kind])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Starting another invite drops the last link from the screen.
    setStatus({ kind: 'submitting' })
    try {
      const invite = await createInvite(email, role)
      setStatus({ kind: 'issued', invite })
      setEmail('')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create the invite'
      setStatus({ kind: 'error', message })
    }
  }

  function hideLink() {
    setStatus({ kind: 'idle' })
    formRef.current?.querySelector('input')?.focus()
  }

  // The token goes after "#": browsers never send that part to any server, so the credential
  // stays out of request logs and Referer headers.
  const link = status.kind === 'issued' ? `${window.location.origin}/invite#${status.invite.token}` : ''
  const submitting = status.kind === 'submitting'

  return (
    <Card as="section" className="users-invite" aria-labelledby="users-invite-title">
      <h2 id="users-invite-title" className="users-card-title">
        Invite someone
      </h2>
      <form ref={formRef} className="users-invite-form" onSubmit={handleSubmit}>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
          aria-describedby={status.kind === 'error' ? errorId : undefined}
          aria-invalid={status.kind === 'error' ? true : undefined}
        />
        <Field label="Role" hint={ROLE_DESCRIPTION[role]}>
          {(control) => (
            <select {...control} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <RoleOptions />
            </select>
          )}
        </Field>
        <div className="users-invite-actions">
          <Button type="submit" busy={submitting}>
            {submitting ? 'Creating…' : 'Create invite'}
          </Button>
        </div>
      </form>
      {status.kind === 'error' && (
        <p id={errorId} className="ui-error-text" role="alert">
          {status.message}
        </p>
      )}
      {status.kind === 'issued' && (
        <OneTimeLink
          key={status.invite.token}
          ref={linkRef}
          label="Invite link"
          link={link}
          expiresAt={status.invite.expiresAt}
          summary={
            <>
              Invite for <strong className="users-mono">{status.invite.email}</strong> as{' '}
              {status.invite.role}. It lasts 24 hours.
            </>
          }
          onHide={hideLink}
        />
      )}
    </Card>
  )
}
