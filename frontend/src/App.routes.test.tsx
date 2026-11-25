import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Role, User } from './api'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    getMe: vi.fn(),
    getIncidents: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    logout: vi.fn().mockResolvedValue(undefined),
  }
})

import * as api from './api'
import App from './App'

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

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  )
}

const getMe = vi.mocked(api.getMe)

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('routes', () => {
  it('shows the landing heading to a signed-out visitor at /', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: /incident tracking/i })).toBeTruthy()
  })

  it('shows the incidents heading to a signed-in user at /', async () => {
    getMe.mockResolvedValue(user('analyst'))
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Incidents' })).toBeTruthy()
  })

  it('sends a signed-out visitor from /account to /signin', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/account')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/signin'))
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
  })

  it('sends a reporter from /admin to /', async () => {
    getMe.mockResolvedValue(user('reporter'))
    renderAt('/admin')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Incidents' })).toBeTruthy()
  })

  it('sends a signed-in user from /signin to /', async () => {
    getMe.mockResolvedValue(user('analyst'))
    renderAt('/signin')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
  })

  it('serves /privacy to anyone', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeTruthy()
  })

  it('sends unknown paths to /', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/nope')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
  })

  it('reads the /invite#abc token and clears the hash', async () => {
    getMe.mockResolvedValue(null)
    window.history.replaceState(null, '', '/invite#abc')
    renderAt('/invite')
    // With a token the form shows; without one the page asks for the full link.
    expect(await screen.findByLabelText('Full name')).toBeTruthy()
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('logs out through the API, then lands on the landing page', async () => {
    getMe.mockResolvedValue(user('analyst'))
    renderAt('/')
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(await screen.findByRole('button', { name: /account menu/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(api.logout).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { level: 1, name: /incident tracking/i })).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe('/')
  })
})

describe('while the session check is pending', () => {
  it('shows neither shell, so a signed-in reload never flashes the public header', () => {
    getMe.mockReturnValue(new Promise(() => {}))
    renderAt('/')
    expect(screen.queryByRole('banner')).toBeNull()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Checking your session')
  })
})

describe('route changes', () => {
  beforeEach(() => {
    document.title = ''
  })

  const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })

  it('names every page in the document title', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/privacy')
    await heading('Privacy')
    await waitFor(() => expect(document.title).toBe('Privacy · SentinelOps'))
  })

  it('names the signed-in home "Incidents"', async () => {
    getMe.mockResolvedValue(user('admin'))
    renderAt('/')
    await heading('Incidents')
    await waitFor(() => expect(document.title).toBe('Incidents · SentinelOps'))
  })

  it('leaves focus alone on the first page after a load', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/privacy')
    await heading('Privacy')
    // Give a pending focus move every chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.activeElement).toBe(document.body)
  })

  it('does not count a redirect on load as a navigation', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/account')
    await heading('Sign in')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.activeElement).toBe(document.body)
  })

  it('moves focus to the new page heading after following a nav link, and titles it', async () => {
    getMe.mockResolvedValue(user('admin'))
    renderAt('/')
    await heading('Incidents')
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(screen.getByRole('link', { name: 'Users' }))
    const users = await heading('Users')
    await waitFor(() => expect(document.activeElement).toBe(users))
    await waitFor(() => expect(document.title).toBe('Users · SentinelOps'))
    // Focusable only for this: once focus leaves, the heading is plain again.
    users.blur()
    expect(users.hasAttribute('tabindex')).toBe(false)
  })

  it('moves focus to the landing heading after logging out from "/" (same address, new page)', async () => {
    getMe.mockResolvedValue(user('analyst'))
    renderAt('/')
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(await screen.findByRole('button', { name: /account menu/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    const landing = await heading(/incident tracking/i)
    await waitFor(() => expect(document.activeElement).toBe(landing))
    await waitFor(() => expect(document.title).toBe('SentinelOps · Incident tracking, watched closely'))
  })

  it('moves focus on a public page too (a footer link)', async () => {
    getMe.mockResolvedValue(null)
    renderAt('/')
    await heading(/incident tracking/i)
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(screen.getAllByRole('link', { name: 'Privacy' })[0])
    const privacy = await heading('Privacy')
    await waitFor(() => expect(document.activeElement).toBe(privacy))
  })
})
