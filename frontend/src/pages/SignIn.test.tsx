import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api'
import App from '../App'
import { SignIn } from './SignIn'

// These tests use the real api.ts with fetch stubbed, so the messages on screen are the ones the
// API client really produces for each response.

const maria: User = {
  id: 'u1',
  email: 'm.santos@example.com',
  fullName: 'Maria Santos',
  role: 'analyst',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> }

/** Answer each request by "METHOD /path"; anything unlisted is a 404. */
function serve(routes: Record<string, Reply>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`
    const reply = routes[key] ?? { status: 404 }
    const body = reply.body === undefined ? null : JSON.stringify(reply.body)
    return new Response(body, { status: reply.status, headers: reply.headers })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderSignIn(onLoggedIn = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/signin']}>
      <Routes>
        <Route path="/signin" element={<SignIn onLoggedIn={onLoggedIn} />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
  return onLoggedIn
}

async function signIn(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SignIn', () => {
  it('is a page with a level-one heading and a labelled form', () => {
    serve({})
    renderSignIn()
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username')
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password')
  })

  it('shows "Invalid email or password" for a wrong password', async () => {
    serve({ 'POST /api/sessions': { status: 401 } })
    renderSignIn()
    await signIn('m.santos@example.com', 'not-the-password')
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password')
  })

  it('shows the wait after too many attempts', async () => {
    serve({ 'POST /api/sessions': { status: 429, headers: { 'Retry-After': '120' } } })
    renderSignIn()
    await signIn('m.santos@example.com', 'not-the-password')
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Too many failed attempts. Try again in 2 minutes.',
    )
  })

  it('hands the user up and goes home after a successful sign-in', async () => {
    serve({ 'POST /api/sessions': { status: 200, body: maria } })
    const onLoggedIn = renderSignIn()
    await signIn('m.santos@example.com', 'correct-horse-battery')
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith(maria))
    expect(screen.getByTestId('where').textContent).toBe('/')
  })
})

describe('a session that ends mid-use', () => {
  function renderApp(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Where />
      </MemoryRouter>,
    )
  }

  it('signs the app out and says so on the sign-in screen', async () => {
    serve({
      'GET /api/me': { status: 200, body: maria },
      'GET /api/incidents': { status: 401 },
    })
    renderApp('/')
    expect(await screen.findByText('Your session ended. Sign in again.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe('/signin')
  })

  // /admin sends anyone who is not an admin to "/"; the expiry must still end on the sign-in screen.
  it('lands on the sign-in screen from a guarded page too', async () => {
    serve({
      'GET /api/me': { status: 200, body: { ...maria, role: 'admin' } },
      'GET /api/users': { status: 401 },
    })
    renderApp('/admin')
    expect(await screen.findByText('Your session ended. Sign in again.')).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe('/signin')
  })

  it('does not call a log out with an already-ended session an expiry', async () => {
    serve({
      'GET /api/me': { status: 200, body: maria },
      'GET /api/incidents': { status: 200, body: [] },
      'DELETE /api/sessions/current': { status: 401 },
    })
    renderApp('/')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /account menu/i }))
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { level: 1, name: /incident tracking/i })).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe('/')
    expect(screen.queryByText('Your session ended. Sign in again.')).toBeNull()
  })

  it('shows the notice once when "log out everywhere" finds the session already ended', async () => {
    serve({
      'GET /api/me': { status: 200, body: maria },
      'DELETE /api/sessions': { status: 401 },
    })
    renderApp('/account')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Log out everywhere' }))
    expect(await screen.findAllByText('Your session ended. Sign in again.')).toHaveLength(1)
    expect(screen.getByTestId('where').textContent).toBe('/signin')
  })
})
