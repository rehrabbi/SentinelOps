import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// jsdom has no window.matchMedia. This stub answers from a table of queries the
// current test has set, defaulting to "does not match", and tells anything that is
// listening when setMatchMedia changes a query.

type Listener = (event: MediaQueryListEvent) => void

const matches = new Map<string, boolean>()
const listeners = new Map<string, Set<Listener>>()

function listenersFor(query: string): Set<Listener> {
  let set = listeners.get(query)
  if (!set) {
    set = new Set()
    listeners.set(query, set)
  }
  return set
}

function createMediaQueryList(query: string): MediaQueryList {
  const add = (_type: string, listener: Listener) => {
    listenersFor(query).add(listener)
  }
  const remove = (_type: string, listener: Listener) => {
    listenersFor(query).delete(listener)
  }
  return {
    get matches() {
      return matches.get(query) ?? false
    },
    media: query,
    onchange: null,
    addEventListener: add,
    removeEventListener: remove,
    addListener: (listener: Listener) => add('change', listener),
    removeListener: (listener: Listener) => remove('change', listener),
    dispatchEvent: () => false,
  } as unknown as MediaQueryList
}

/** Make `window.matchMedia(query)` report `matches`, and notify its change listeners. */
export function setMatchMedia(query: string, value: boolean): void {
  const changed = (matches.get(query) ?? false) !== value
  matches.set(query, value)
  if (!changed) return
  const event = { matches: value, media: query } as MediaQueryListEvent
  for (const listener of [...listenersFor(query)]) listener(event)
}

beforeEach(() => {
  // jsdom has no layout, so no scrolling; its scrollTo only logs "not implemented".
  window.scrollTo = () => {}
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: createMediaQueryList,
  })
})

afterEach(() => {
  cleanup()
  matches.clear()
  listeners.clear()
})
