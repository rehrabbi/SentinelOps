import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Role, User } from '../api'
import { AppShell } from './AppShell'

function user(role: Role): User {
  return {
    id: 'u1',
    email: 'm.santos@example.com',
    fullName: 'Maria Santos',
    role,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  }
}

function renderShell(role: Role, onLogout = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell user={user(role)} onLogout={onLogout}>
        <h1>Incidents</h1>
      </AppShell>
    </MemoryRouter>,
  )
  return onLogout
}

describe('AppShell', () => {
  it('starts with a skip link to the main content', () => {
    renderShell('analyst')
    const links = screen.getAllByRole('link')
    expect(links[0].textContent).toBe('Skip to content')
    expect(links[0].getAttribute('href')).toBe('#main')
    expect(screen.getByRole('main').id).toBe('main')
  })

  it('shows Users in the nav for admins only', () => {
    renderShell('admin')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Incidents',
      'Users',
      'Account',
    ])
  })

  it('hides Users from everyone else', () => {
    renderShell('reporter')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Incidents', 'Account'])
  })

  it('marks the current page in the nav', () => {
    renderShell('analyst')
    const current = screen.getByRole('link', { name: 'Incidents' })
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  it('opens the user menu, which holds the theme toggle and Log out', async () => {
    const onLogout = renderShell('analyst')
    const trigger = screen.getByRole('button', { name: /Maria Santos/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('closes the user menu on Escape and returns focus to its button', async () => {
    renderShell('analyst')
    const trigger = screen.getByRole('button', { name: /Maria Santos/ })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull())
  })

  it('mounts the toaster once', () => {
    renderShell('analyst')
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
