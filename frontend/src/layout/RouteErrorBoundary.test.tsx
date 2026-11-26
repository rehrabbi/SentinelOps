import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api'
import { AppShell } from './AppShell'
import { RouteErrorBoundary } from './RouteErrorBoundary'

const me: User = {
  id: 'u1',
  email: 'm.santos@example.com',
  fullName: 'Maria Santos',
  role: 'analyst',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
}

function Broken(): never {
  // What a refused dynamic import looks like to React: the lazy component throws on render.
  throw new TypeError('Failed to fetch dynamically imported module')
}

beforeEach(() => {
  // React and the boundary both log the caught error; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RouteErrorBoundary', () => {
  it('keeps the shell, says the page did not load, and offers Reload', async () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as Location)
    render(
      <MemoryRouter>
        <AppShell user={me} onLogout={vi.fn()}>
          <RouteErrorBoundary>
            <Broken />
          </RouteErrorBoundary>
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('This page didn’t load')
    expect(screen.getByRole('alert').textContent).toBe('The site may have just been updated. Reload to get the latest version.')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows its children when nothing fails', () => {
    render(
      <RouteErrorBoundary>
        <p>All good</p>
      </RouteErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
