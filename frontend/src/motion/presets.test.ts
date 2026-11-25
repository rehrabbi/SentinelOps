import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { transition, variants } from './presets'
import { useReducedMotion } from './useReducedMotion'

const QUERY = '(prefers-reduced-motion: reduce)'
const VARIANT_KINDS = ['fadeUp', 'scan', 'stagger'] as const
const TRANSITION_KINDS = ['enter', 'exit', 'emphasis'] as const
const TRANSFORMS = ['x', 'y', 'scale'] as const
const IDENTITY: Record<string, number> = { x: 0, y: 0, scale: 1 }

describe('variants under reduced motion', () => {
  for (const kind of VARIANT_KINDS) {
    it(`${kind}: initial state shows the content, with no offset`, () => {
      const initial = variants(kind, true).initial as Record<string, unknown>
      expect(initial.opacity ?? 1).toBe(1)
      for (const key of TRANSFORMS) {
        expect(initial[key] ?? IDENTITY[key]).toBe(IDENTITY[key])
      }
    })
  }

  it('non-reduced fadeUp does start hidden and offset', () => {
    const initial = variants('fadeUp', false).initial as Record<string, number>
    expect(initial.opacity).toBe(0)
    expect(initial.y).not.toBe(0)
  })
})

describe('transition', () => {
  it('keeps every kind short under reduced motion', () => {
    for (const kind of TRANSITION_KINDS) {
      expect(transition(kind, true).duration).toBeLessThanOrEqual(0.15)
    }
  })

  it('makes working-screen enters snappy and exits faster than enters', () => {
    const enter = transition('enter', false).duration as number
    const exit = transition('exit', false).duration as number
    expect(enter).toBeLessThan(0.3)
    expect(exit).toBeLessThan(enter)
  })
})

describe('useReducedMotion', () => {
  it('is false by default', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('is true when the system asks for reduced motion', () => {
    setMatchMedia(QUERY, true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('follows the preference live', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => setMatchMedia(QUERY, true))
    expect(result.current).toBe(true)
    act(() => setMatchMedia(QUERY, false))
    expect(result.current).toBe(false)
  })
})
