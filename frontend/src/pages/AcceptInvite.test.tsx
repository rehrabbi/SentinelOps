import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce } from '../test/visibility'
import { AcceptInvite } from './AcceptInvite'

const maria: User = {
  id: 'u1',
  email: 'm.santos@example.com',
  fullName: 'Maria Santos',
  role: 'analyst',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
}

type Reply = { status: number; body?: unknown }

/** Answer each request by "METHOD /path"; anything unlisted is a 404. */
function serve(routes: Record<string, Reply>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`
    const reply = routes[key] ?? { status: 404 }
    // The API sends errors as plain text and successes as JSON.
    const text =
      reply.body === undefined ? null : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)
    return new Response(text, { status: reply.status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderInvite(onLoggedIn = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/invite']}>
      <Routes>
        <Route path="/invite" element={<AcceptInvite onLoggedIn={onLoggedIn} />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
  return onLoggedIn
}

async function fill(password: string, confirm: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Full name'), 'Maria Santos')
  await user.type(screen.getByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/invite#invite-link-fixture')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AcceptInvite', () => {
  it('needs the full link: without a token it says so and offers sign-in', () => {
    window.history.replaceState(null, '', '/invite')
    renderInvite()
    expect(screen.getByRole('heading', { level: 1, name: 'Accept your invite' })).toBeTruthy()
    expect(screen.getByText(/needs the full invite link/i)).toBeTruthy()
    expect(screen.queryByLabelText('Full name')).toBeNull()
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/signin')
  })

  it('reads the token once and clears it from the address bar', () => {
    renderInvite()
    expect(window.location.hash).toBe('')
    expect(screen.getByLabelText('Full name')).toBeTruthy()
  })

  it('has a level-one heading and new-password fields of at least 12 characters', () => {
    renderInvite()
    expect(screen.getByRole('heading', { level: 1, name: 'Accept your invite' })).toBeTruthy()
    for (const label of ['Password', 'Confirm password']) {
      const input = screen.getByLabelText(label)
      expect(input.getAttribute('autocomplete')).toBe('new-password')
      expect(input.getAttribute('minlength')).toBe('12')
    }
  })

  it('shows "The passwords do not match" and sends nothing', async () => {
    const fetchMock = serve({})
    renderInvite()
    await fill('correct-horse-battery-2', 'correct-horse-battery-3')
    expect(await screen.findByText('The passwords do not match')).toBeTruthy()
    expect(screen.getByLabelText('Confirm password').getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates the account, logs in and goes home', async () => {
    const fetchMock = serve({
      'POST /api/invites/accept': { status: 200, body: maria },
      'POST /api/sessions': { status: 200, body: maria },
    })
    const onLoggedIn = renderInvite()
    await fill('correct-horse-battery-2', 'correct-horse-battery-2')
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith(maria))
    expect(screen.getByTestId('where').textContent).toBe('/')

    // The token is the part after "#", without the "#", and travels with the name and password.
    const calls = fetchMock.mock.calls
    const accept = calls.find(([url]) => String(url).endsWith('/api/invites/accept'))
    expect(JSON.parse(String(accept?.[1]?.body))).toEqual({
      token: 'invite-link-fixture',
      fullName: 'Maria Santos',
      password: 'correct-horse-battery-2',
    })
    const signIn = calls.find(([url]) => String(url).endsWith('/api/sessions'))
    expect(JSON.parse(String(signIn?.[1]?.body))).toEqual({
      email: maria.email,
      password: 'correct-horse-battery-2',
    })
  })

  it('treats an empty hash as no token and sends nothing', () => {
    window.history.replaceState(null, '', '/invite#')
    const fetchMock = serve({})
    renderInvite()
    expect(screen.getByText(/needs the full invite link/i)).toBeTruthy()
    expect(screen.queryByLabelText('Full name')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server message when the invite is refused', async () => {
    serve({ 'POST /api/invites/accept': { status: 400, body: 'This invite has expired' } })
    renderInvite()
    await fill('correct-horse-battery-2', 'correct-horse-battery-2')
    expect((await screen.findByRole('alert')).textContent).toContain('This invite has expired')
  })

  it('under reduced motion has the form on screen from the first render', () => {
    setMatchMedia('(prefers-reduced-motion: reduce)', true)
    renderInvite()
    const input = screen.getByLabelText('Full name')
    expectShownAtOnce(input.closest('form') as HTMLElement, input)
  })
})
