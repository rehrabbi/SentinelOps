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

// At most this many on screen; the oldest goes first.
const MAX_VISIBLE = 3

function emit() {
  for (const listener of listeners) listener()
}

/**
 * Show a short message that confirms something happened ("Incident INC-0142 saved").
 * Not for errors a person must fix in a form: show those beside the field.
 */
export function toast(message: string, kind: ToastKind = 'info'): number {
  const id = nextId++
  items = [...items, { id, message, kind }].slice(-MAX_VISIBLE)
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
