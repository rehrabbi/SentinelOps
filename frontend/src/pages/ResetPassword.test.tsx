import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { ResetPassword } from './ResetPassword'

// The real api.ts with fetch stubbed, as in SignIn.test.tsx.
function serve(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderReset(onSessionChanged = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/reset']}>
      <Routes>
        <Route path="/reset" element={<ResetPassword onSessionChanged={onSessionChanged} />} />
        <Route path="/signin" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return onSessionChanged
}


/** No jest-dom here, so "visible" is checked by hand: not hidden, not display:none, visibility or opacity 0. */
function isShown(el: HTMLElement): boolean {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const css = getComputedStyle(e)
    if (e.hidden || css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0') return false
  }
  return true
}

/**
 * Fails if the form is hidden on the first frame: no element from the form up to the page root has
 * an inline opacity of 0 or a transform (a Motion variant would set these inline), and the form
 * and its first input pass Testing Library's visibility check.
 */
function expectShownAtOnce(form: HTMLElement, firstInput: HTMLElement) {
  for (let el: HTMLElement | null = form; el; el = el.parentElement) {
    expect(el.style.opacity, `${el.tagName}.${el.className} opacity`).not.toBe('0')
    expect(el.style.transform, `${el.tagName}.${el.className} transform`).toMatch(/^(|none)$/)
    expect(el.style.clipPath, `${el.tagName}.${el.className} clip-path`).toBe('')
  }
  expect(isShown(form)).toBe(true)
  expect(isShown(firstInput)).toBe(true)
}

async function fill(password: string, confirm: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), password)
  await user.type(screen.getByLabelText('Confirm new password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Set new password' }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/reset#tok-123')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ResetPassword', () => {
  it('needs the full link: without a token it says so and offers sign-in', () => {
    window.history.replaceState(null, '', '/reset')
    renderReset()
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeTruthy()
    expect(screen.getByText(/needs the full reset link/i)).toBeTruthy()
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/signin')
  })

  it('reads the token once and clears it from the address bar', () => {
    renderReset()
    expect(window.location.hash).toBe('')
    expect(screen.getByLabelText('New password')).toBeTruthy()
  })

  it('has a level-one heading and new-password fields of at least 12 characters', () => {
    renderReset()
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeTruthy()
    for (const label of ['New password', 'Confirm new password']) {
      const input = screen.getByLabelText(label)
      expect(input.getAttribute('autocomplete')).toBe('new-password')
      expect(input.getAttribute('minlength')).toBe('12')
    }
  })

  it('shows "The passwords do not match" and sends nothing', async () => {
    const fetchMock = serve(204)
    renderReset()
    await fill('correct-horse-battery-2', 'correct-horse-battery-3')
    expect(await screen.findByText('The passwords do not match')).toBeTruthy()
    expect(screen.getByLabelText('Confirm new password').getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirms that every session was logged out, and refreshes the session', async () => {
    const fetchMock = serve(204)
    const onSessionChanged = renderReset()
    await fill('correct-horse-battery-2', 'correct-horse-battery-2')
    expect(await screen.findByText(/every session of your account was logged out/i)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Password reset' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/signin')
    expect(onSessionChanged).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the server message when the link is refused', async () => {
    serve(400, { error: 'This reset link has expired' })
    renderReset()
    await fill('correct-horse-battery-2', 'correct-horse-battery-2')
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).not.toBe('')
  })

  it('under reduced motion shows the form on the first render, and later the confirmation', async () => {
    setMatchMedia('(prefers-reduced-motion: reduce)', true)
    serve(204)
    renderReset()
    const input = screen.getByLabelText('New password')
    expectShownAtOnce(input.closest('form') as HTMLElement, input)
    await fill('correct-horse-battery-2', 'correct-horse-battery-2')
    const done = await screen.findByRole('group', { name: 'Password reset' })
    expect(done.style.opacity).not.toBe('0')
    expect(isShown(done)).toBe(true)
  })

  it('moves focus to the named, described confirmation after a successful reset', async () => {
    serve(204)
    renderReset()
    await fill('correct-horse-battery-2', 'correct-horse-battery-2')
    const done = await screen.findByRole('group', { name: 'Password reset' })
    await waitFor(() => expect(document.activeElement).toBe(done))
    expect(document.activeElement).not.toBe(document.body)
    const description = document.getElementById(done.getAttribute('aria-describedby') ?? '')
    expect(description?.textContent).toMatch(/every session of your account was logged out/i)
  })
})
