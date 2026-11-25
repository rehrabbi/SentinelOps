import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { ThemeToggle } from './ThemeToggle'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

it('shows the current choice and changes theme when another is picked', async () => {
  setMatchMedia('(prefers-color-scheme: dark)', true)
  render(<ThemeToggle />)
  const group = screen.getByRole('group', { name: 'Colour theme' })
  expect(group).toBeTruthy()
  expect(screen.getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(screen.getByRole('button', { name: 'Light' }))
  expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('false')
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('sentinelops.theme')).toBe('light')
})
