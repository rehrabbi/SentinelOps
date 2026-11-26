import { expect, it } from 'vitest'
import { setMatchMedia } from './setup'

const REDUCED = '(prefers-reduced-motion: reduce)'

it('matchMedia defaults to no match and follows setMatchMedia', () => {
  expect(window.matchMedia(REDUCED).matches).toBe(false)
  setMatchMedia(REDUCED, true)
  expect(window.matchMedia(REDUCED).matches).toBe(true)
})

it('fires change listeners when a listened-to query changes, and resets between tests', () => {
  const seen: boolean[] = []
  const list = window.matchMedia(REDUCED)
  list.addEventListener('change', (event) => seen.push(event.matches))
  setMatchMedia(REDUCED, true)
  setMatchMedia(REDUCED, true)
  setMatchMedia(REDUCED, false)
  expect(seen).toEqual([true, false])
})

it('starts each test with no queries matching', () => {
  expect(window.matchMedia(REDUCED).matches).toBe(false)
})
