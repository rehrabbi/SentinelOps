import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { transition } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import {
  dismissToast,
  getToasts,
  latestToastId,
  subscribeToasts,
  type ToastItem,
  type ToastKind,
} from './toast-store'
import './Toast.css'

// How long each kind stays up. Info and success only confirm something the screen already shows
// (the new incident is in the list, the new role is in its row), so they may go by themselves;
// the clock stops while the pointer or focus is on one, or the tab is hidden. An error says
// something the person may need to act on, so it stays until they dismiss it (WCAG 2.2.1).
const DURATION: Record<ToastKind, number | null> = { info: 5000, success: 5000, error: null }

// Read before the message, so the kind is in words as well as colour and icon.
const KIND_LABEL: Record<ToastKind, string> = { info: 'Note:', success: 'Done:', error: 'Error:' }

function KindIcon({ kind }: { kind: ToastKind }) {
  return (
    <svg className="ui-toast-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {kind === 'success' ? (
        <path
          d="M3 8.4 6.4 11.5 13 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : kind === 'error' ? (
        <>
          <path d="M8 1.5 15 14H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

/**
 * The toast to announce: the newest one, while it is on screen, if it arrived after this Toaster
 * mounted (one already showing when the page changes was read where it first appeared).
 */
function useNewest(items: readonly ToastItem[]): ToastItem | null {
  const [before] = useState(latestToastId)
  const latest = latestToastId()
  if (latest <= before) return null
  // Once the newest is dismissed, nothing is announced: an older toast never moves up into its place.
  return items.find((item) => item.id === latest) ?? null
}

/** True while the page is in a background tab, so toasts do not expire unseen. */
function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return hidden
}

function Toast({ item, pageHidden, reduced }: { item: ToastItem; pageHidden: boolean; reduced: boolean }) {
  const messageId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remaining = useRef(DURATION[item.kind])
  const paused = hovered || focused || pageHidden

  // Count down only while nobody is reading it; resume from where it stopped.
  useEffect(() => {
    if (paused || remaining.current === null) return
    const started = Date.now()
    const timer = setTimeout(() => dismissToast(item.id), remaining.current)
    return () => {
      clearTimeout(timer)
      if (remaining.current !== null) remaining.current = Math.max(0, remaining.current - (Date.now() - started))
    }
  }, [paused, item.id])

  return (
    <motion.li
      layout={reduced ? false : 'position'}
      className={`ui-toast ui-toast-${item.kind}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: transition('enter', reduced) }}
      exit={reduced ? { opacity: 0, transition: transition('exit', true) } : { opacity: 0, scale: 0.98, transition: transition('exit', false) }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <KindIcon kind={item.kind} />
      <p className="ui-toast-message" id={messageId}>
        <span className="visually-hidden">{KIND_LABEL[item.kind]} </span>
        {item.message}
      </p>
      <button
        type="button"
        className="ui-toast-dismiss"
        aria-label="Dismiss"
        aria-describedby={messageId}
        onClick={() => dismissToast(item.id)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </motion.li>
  )
}

/**
 * Where toast() messages appear: bottom right (bottom, full width, on phones). The shells mount it
 * once; do not mount another.
 *
 * Announcing is kept apart from the visible stack. A polite live region holds only the newest
 * toast, so a screen reader reads each message once, as it arrives: never the older ones again
 * when the stack changes, and nothing when one goes. (aria-relevant="additions" on the stack
 * itself would say the same, but screen readers honour it unevenly.)
 */
export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  const reduced = useReducedMotion()
  const pageHidden = usePageHidden()
  const newest = useNewest(items)

  return (
    <div className="ui-toaster">
      <p className="visually-hidden" role="status">
        {newest ? (
          // Keyed, so a repeated message is a new node and is read again.
          <span key={newest.id}>
            {KIND_LABEL[newest.kind]} {newest.message}
          </span>
        ) : null}
      </p>
      <ol className="ui-toaster-list" aria-label="Notifications">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <Toast key={item.id} item={item} pageHidden={pageHidden} reduced={reduced} />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}
