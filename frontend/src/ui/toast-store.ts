// The toast queue. Kept apart from the <Toaster> component so any module can call toast()
// without importing React components (and so fast refresh keeps working on Toast.tsx).

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

type Listener = () => void

let items: readonly ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()

// At most this many on screen. Over the cap, the oldest non-error goes first: errors stay until
// dismissed, so one is dropped only when every toast shown is an error.
const MAX_VISIBLE = 3

function emit() {
  for (const listener of listeners) listener()
}

function evict(list: readonly ToastItem[]): readonly ToastItem[] {
  const next = [...list]
  while (next.length > MAX_VISIBLE) {
    const i = next.findIndex((t) => t.kind !== 'error')
    next.splice(i === -1 ? 0 : i, 1)
  }
  return next
}

/**
 * Show a short message that confirms something happened ("Incident INC-0142 saved").
 * Not for errors a person must fix in a form: show those beside the field.
 */
export function toast(message: string, kind: ToastKind = 'info'): number {
  const id = nextId++
  items = evict([...items, { id, message, kind }])
  emit()
  return id
}

export function dismissToast(id: number): void {
  if (!items.some((t) => t.id === id)) return
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Remove every toast. For tests, and for moments such as signing out. */
export function clearToasts(): void {
  if (items.length === 0) return
  items = []
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToasts(): readonly ToastItem[] {
  return items
}

/** The id of the most recent toast() call (0 before the first), whether or not it is still shown. */
export function latestToastId(): number {
  return nextId - 1
}
