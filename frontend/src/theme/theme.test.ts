import { afterEach, describe, expect, it, vi } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { applyTheme, initTheme, readChoice, resolveTheme, saveChoice } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('resolveTheme', () => {
  it('follows the system when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('ignores the system when the choice is explicit', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('readChoice and saveChoice', () => {
  it('returns system when nothing is stored', () => {
    expect(readChoice()).toBe('system')
  })
  it('returns system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readChoice()).toBe('system')
  })
  it('returns system when the stored value is invalid', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('purple')
    expect(readChoice()).toBe('system')
  })
  it('remembers a saved choice', () => {
    saveChoice('dark')
    expect(readChoice()).toBe('dark')
  })
  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => saveChoice('light')).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('sets data-theme on the root element', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('initTheme', () => {
  const DARK = '(prefers-color-scheme: dark)'

  it('applies the system theme, and follows the system when it changes, with no toggle mounted', () => {
    setMatchMedia(DARK, true)
    initTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
    setMatchMedia(DARK, false)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('leaves an explicit choice alone when the system changes', () => {
    saveChoice('dark')
    setMatchMedia(DARK, true)
    initTheme()
    setMatchMedia(DARK, false)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
