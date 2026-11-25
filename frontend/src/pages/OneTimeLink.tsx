import { forwardRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import './Users.css'

// A one-time link is a credential. This panel shows it once, in the moment it is issued, and the
// page that owns it drops it as soon as the admin moves on. It holds the link in memory only: it
// is never written to storage, never put in the address bar and never logged.

const EXPIRES = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

function formatExpiry(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : `${EXPIRES.format(date)} UTC`
}

export interface OneTimeLinkProps {
  /** Names the link for screen readers: "Invite link", "Password reset link". */
  label: string
  link: string
  /** ISO time from the server. */
  expiresAt: string
  /** The panel's lead sentence: who the link is for and what it does. */
  summary: ReactNode
  /** Hides the link for good. The owner puts focus back where the person was working. */
  onHide: () => void
}

/**
 * The link, when it expires, a Copy button and a Hide button. The text sits in a read-only
 * textarea so a long link wraps instead of scrolling sideways, and focusing it selects all of it.
 * The forwarded ref points at the textarea so the owner can move focus here when it appears.
 */
export const OneTimeLink = forwardRef<HTMLTextAreaElement, OneTimeLinkProps>(function OneTimeLink(
  { label, link, expiresAt, summary, onHide },
  ref,
) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copyLink(e: MouseEvent<HTMLButtonElement>) {
    const area = e.currentTarget.closest('.users-link')?.querySelector('textarea')
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
    } catch {
      // Clipboard access can be refused. Leave the link selected so Ctrl+C or a long press works.
      setCopy('failed')
      area?.focus()
      area?.select()
    }
  }

  return (
    <div className="users-link">
      <p className="users-link-summary">{summary}</p>
      <textarea
        ref={ref}
        className="users-link-text"
        aria-label={label}
        readOnly
        rows={3}
        spellCheck={false}
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className="users-link-terms">
        Works once. Expires {formatExpiry(expiresAt)}. SentinelOps sends no email, so pass this
        link on yourself, only to the person it is for.
      </p>
      <div className="users-link-actions">
        <Button variant="secondary" onClick={copyLink}>
          {copy === 'copied' ? 'Copied' : 'Copy link'}
        </Button>
        <Button variant="ghost" onClick={onHide}>
          Hide link
        </Button>
      </div>
      {/* Always in the page so a screen reader hears the text appear. */}
      <p role="status" className={copy === 'failed' ? 'users-link-note users-link-note-bad' : 'users-link-note'}>
        {copy === 'copied' && 'Link copied.'}
        {copy === 'failed' && 'Could not copy automatically. The link is selected: copy it by hand.'}
      </p>
    </div>
  )
})
