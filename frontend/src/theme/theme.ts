import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'dark' | 'light'
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'sentinelops.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'dark' || value === 'light'
}

/** The stored choice, or 'system' when nothing valid is stored or storage is unavailable. */
export function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isChoice(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Remember the choice on this device. Storage can be blocked or full, so never throw. */
export function saveChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // The choice still applies for this visit; it just will not be remembered.
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

/**
 * Apply the remembered choice, and keep following the system while that choice is "system".
 * Call once before the first render. (The toggle follows the system too while it is mounted, but
 * on signed-in screens it lives in a menu that is usually closed.)
 */
export function initTheme(): void {
  applyTheme(resolveTheme(readChoice(), systemPrefersDark()))
  window.matchMedia(DARK_QUERY).addEventListener('change', (event) => {
    if (readChoice() === 'system') applyTheme(event.matches ? 'dark' : 'light')
  })
}

export function useTheme(): {
  choice: ThemeChoice
  theme: Theme
  setChoice: (choice: ThemeChoice) => void
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice)
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const theme = resolveTheme(choice, systemDark)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setChoice = useCallback((next: ThemeChoice) => {
    saveChoice(next)
    setChoiceState(next)
  }, [])

  return { choice, theme, setChoice }
}
