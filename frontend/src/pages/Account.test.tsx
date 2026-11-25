import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, changePassword: vi.fn(), logoutEverywhere: vi.fn() }
})

import * as api from '../api'
import { AccountPage } from './Account'

const changePassword = vi.mocked(api.changePassword)
const logoutEverywhere = vi.mocked(api.logoutEverywhere)

const ME: User = {
  id: 'me',
  email: 'ada.admin@example.test',
  fullName: 'Ada Admin',
  role: 'admin',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
}

const onLoggedOut = vi.fn()

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountPage user={ME} onLoggedOut={onLoggedOut} />} />
        <Route path="/signin" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fill(u: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  await u.type(screen.getByLabelText('Current password'), current)
  await u.type(screen.getByLabelText('New password'), next)
  await u.type(screen.getByLabelText('Confirm new password'), confirm)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Account page', () => {
  it('has one h1, "Account", with the email shown', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Account'])
    expect(screen.getByText(ME.email)).toBeTruthy()
  })

  it('changes the password, clears the fields and moves focus to the confirmation', async () => {
    const u = userEvent.setup()
    changePassword.mockResolvedValue(undefined)
    renderPage()
    await fill(u, 'old-password-1', 'brand-new-password', 'brand-new-password')
    await u.click(screen.getByRole('button', { name: 'Change password' }))
    expect(changePassword).toHaveBeenCalledWith('old-password-1', 'brand-new-password')
    const done = await screen.findByText(/password changed/i)
    expect(done.textContent).toMatch(/other sessions were logged out/i)
    await waitFor(() => expect(document.activeElement).toBe(done))
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('')
    expect(onLoggedOut).not.toHaveBeenCalled()
  })

  it('refuses a confirmation that does not match, without calling the API, and focuses it', async () => {
    const u = userEvent.setup()
    renderPage()
    await fill(u, 'old-password-1', 'brand-new-password', 'brand-new-passwore')
    await u.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('The new passwords do not match')).toBeTruthy()
    expect(changePassword).not.toHaveBeenCalled()
    const confirm = screen.getByLabelText('Confirm new password')
    expect(confirm.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(confirm)
  })

  it('shows "current password is incorrect" and keeps the user signed in', async () => {
    const u = userEvent.setup()
    changePassword.mockRejectedValue(new api.ApiError(403, 'current password is incorrect'))
    renderPage()
    await fill(u, 'wrong-password-1', 'brand-new-password', 'brand-new-password')
    await u.click(screen.getByRole('button', { name: 'Change password' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('current password is incorrect')
    expect(screen.getByLabelText('Current password').getAttribute('aria-describedby')).toBe(alert.id)
    expect(onLoggedOut).not.toHaveBeenCalled()
    // Still on the Account page, fields kept so the person can correct the one that was wrong.
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy()
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('wrong-password-1')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change password' })))
  })

  it('logs out everywhere, tells the app, and leaves for the sign-in screen', async () => {
    const u = userEvent.setup()
    logoutEverywhere.mockResolvedValue(undefined)
    renderPage()
    await u.click(screen.getByRole('button', { name: 'Log out everywhere' }))
    expect(logoutEverywhere).toHaveBeenCalledTimes(1)
    expect(onLoggedOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
  })

  it('stays put, says why and refocuses the button when logging out everywhere fails', async () => {
    const u = userEvent.setup()
    logoutEverywhere.mockRejectedValue(new api.ApiError(500, 'could not end sessions'))
    renderPage()
    await u.click(screen.getByRole('button', { name: 'Log out everywhere' }))
    expect((await screen.findByRole('alert')).textContent).toBe('could not end sessions')
    expect(onLoggedOut).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Log out everywhere' })))
  })
})
