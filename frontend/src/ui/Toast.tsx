import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { transition } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type ToastItem,
  type ToastKind,
} from './toast-store'
import './Toast.css'

// How long each kind stays up. Errors stay longer: they take longer to read and act on.
const DURATION: Record<ToastKind, number> = { info: 5000, success: 5000, error: 8000 }

// Read before the message, so the kind is in words as well as colour and icon.
const KIND_LABEL: Record<ToastKind, string> = { info: 'Note:', success: 'Done:', error: 'Error:' }

function KindIcon({ kind }: { kind: ToastKind }) {
  return (
    <svg className="toast-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
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
    if (paused) return
    const started = Date.now()
    const timer = setTimeout(() => dismissToast(item.id), remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - started))
    }
  }, [paused, item.id])

  return (
    <motion.li
      layout={reduced ? false : 'position'}
      className={`toast toast-${item.kind}`}
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
      <p className="toast-message" id={messageId}>
        <span className="visually-hidden">{KIND_LABEL[item.kind]} </span>
        {item.message}
      </p>
      <button
        type="button"
        className="toast-dismiss"
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
 * Where toast() messages appear: one polite live region, bottom right (bottom, full width, on
 * phones). The shells mount it once; do not mount another.
 */
export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  const reduced = useReducedMotion()
  const pageHidden = usePageHidden()

  return (
    <div className="toaster" role="status" aria-live="polite" aria-label="Notifications">
      <ol className="toaster-list">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <Toast key={item.id} item={item} pageHidden={pageHidden} reduced={reduced} />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}
