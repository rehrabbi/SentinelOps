import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Role, User } from '../api'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce } from '../test/visibility'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    getUsers: vi.fn(),
    updateUserRole: vi.fn(),
    createInvite: vi.fn(),
    createPasswordReset: vi.fn(),
  }
})

import * as api from '../api'
import { Toaster } from '../ui/Toast'
import { clearToasts } from '../ui/toast-store'
import { UsersPage } from './Users'

const REDUCE = '(prefers-reduced-motion: reduce)'
const getUsers = vi.mocked(api.getUsers)
const updateUserRole = vi.mocked(api.updateUserRole)
const createInvite = vi.mocked(api.createInvite)
const createPasswordReset = vi.mocked(api.createPasswordReset)

function user(id: string, fullName: string, role: Role = 'reporter'): User {
  return {
    id,
    email: `${fullName.toLowerCase().replace(/ /g, '.')}@example.test`,
    fullName,
    role,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  }
}

const ME = user('me', 'Ada Admin', 'admin')
const BOB = user('bob', 'Bob Reporter', 'reporter')

function renderPage() {
  return render(
    <>
      <UsersPage currentUserId="me" />
      <Toaster />
    </>,
  )
}

const roleSelect = (name: string) => screen.getByRole('combobox', { name: `Role for ${name}` }) as HTMLSelectElement
const TOKEN = 'reset-link-fixture'

let writeText: ReturnType<typeof vi.fn>

// userEvent.setup() installs its own clipboard stub, so ours goes in after it.
function setup() {
  const u = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return u
}

beforeEach(() => {
  vi.clearAllMocks()
  clearToasts()
  getUsers.mockResolvedValue([ME, BOB])
  writeText = vi.fn().mockResolvedValue(undefined)
})

afterEach(() => {
  window.localStorage.clear()
})

describe('Users page', () => {
  it('has one h1 and lists everyone', async () => {
    renderPage()
    expect(await screen.findByText('Bob Reporter')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Users'])
    expect(screen.getByText('(you)')).toBeTruthy()
  })

  it('shows a load error with Retry, and Retry loads the list', async () => {
    const u = setup()
    getUsers.mockRejectedValueOnce(new api.ApiError(500, 'database is down'))
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toBe('database is down')
    await u.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Bob Reporter')).toBeTruthy()
    expect(getUsers).toHaveBeenCalledTimes(2)
  })

  it("gives the admin's own row no editable role and no Reset password", async () => {
    renderPage()
    await screen.findByText('Bob Reporter')
    expect(roleSelect('Ada Admin').disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /save role for ada admin/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reset password for ada admin/i })).toBeNull()
    expect(roleSelect('Bob Reporter').disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Reset password for Bob Reporter' })).toBeTruthy()
  })

  it('changes a role through the API, replaces the row and keeps focus on the select', async () => {
    const u = setup()
    updateUserRole.mockResolvedValue({ ...BOB, role: 'analyst' })
    renderPage()
    await screen.findByText('Bob Reporter')
    const save = screen.getByRole('button', { name: 'Save role for Bob Reporter' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await u.selectOptions(roleSelect('Bob Reporter'), 'analyst')
    expect(save.disabled).toBe(false)
    await u.click(save)
    expect(updateUserRole).toHaveBeenCalledWith('bob', 'analyst')
    await waitFor(() => expect(document.activeElement).toBe(roleSelect('Bob Reporter')))
    expect(roleSelect('Bob Reporter').value).toBe('analyst')
    expect(screen.getByText('Bob Reporter is now analyst')).toBeTruthy()
  })

  it("restores the previous role and shows the server's message when a change is refused", async () => {
    const u = setup()
    updateUserRole.mockRejectedValue(new api.ApiError(403, 'you cannot do that'))
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.selectOptions(roleSelect('Bob Reporter'), 'admin')
    await u.click(screen.getByRole('button', { name: 'Save role for Bob Reporter' }))
    const row = screen.getByText('Bob Reporter', { selector: '.users-name' }).closest('li') as HTMLElement
    expect((await within(row).findByRole('alert')).textContent).toBe('you cannot do that')
    expect(roleSelect('Bob Reporter').value).toBe('reporter')
    // The error is tied to the control, and focus came back to it.
    const errorId = within(row).getByRole('alert').id
    expect(roleSelect('Bob Reporter').getAttribute('aria-describedby')).toContain(errorId)
    await waitFor(() => expect(document.activeElement).toBe(roleSelect('Bob Reporter')))
  })

  it('shows a reset link once, with Copy, and moves focus to it', async () => {
    const u = setup()
    createPasswordReset.mockResolvedValue({
      email: BOB.email,
      expiresAt: '2026-11-25T10:00:00Z',
      token: TOKEN,
    })
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    expect(createPasswordReset).toHaveBeenCalledWith('bob')
    const link = (await screen.findByRole('textbox', { name: 'Password reset link' })) as HTMLTextAreaElement
    expect(link.value).toBe(`${window.location.origin}/reset#${TOKEN}`)
    expect(link.readOnly).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(link))
    expect(screen.getByText(/works once/i).textContent).toMatch(/25 Nov 2026, 10:00 UTC/)
    expect(screen.getByText(/sends no email/i)).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/reset#${TOKEN}`)
    expect(await screen.findByText('Link copied.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()

    // Hiding drops the link for good and hands focus back to the button that made it.
    await u.click(screen.getByRole('button', { name: 'Hide link' }))
    expect(screen.queryByRole('textbox', { name: 'Password reset link' })).toBeNull()
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
  })

  it('keeps only one reset link on screen: issuing for someone else drops the first', async () => {
    const u = setup()
    const cy = user('cy', 'Cy Analyst', 'analyst')
    getUsers.mockResolvedValue([ME, BOB, cy])
    createPasswordReset
      .mockResolvedValueOnce({ email: BOB.email, expiresAt: '2026-11-25T10:00:00Z', token: 'first_token' })
      .mockResolvedValueOnce({ email: cy.email, expiresAt: '2026-11-25T10:00:00Z', token: 'second_token' })
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    await screen.findByRole('textbox', { name: 'Password reset link' })
    await u.click(screen.getByRole('button', { name: 'Reset password for Cy Analyst' }))
    await waitFor(() => expect(document.body.textContent).not.toContain('first_token'))
    const links = screen.getAllByRole('textbox', { name: 'Password reset link' }) as HTMLTextAreaElement[]
    expect(links).toHaveLength(1)
    expect(links[0].value).toContain('second_token')
  })

  it("shows the server's message when a reset cannot be made", async () => {
    const u = setup()
    createPasswordReset.mockRejectedValue(new api.ApiError(404, 'user not found'))
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    expect((await screen.findByRole('alert')).textContent).toBe('user not found')
    expect(screen.queryByRole('textbox', { name: 'Password reset link' })).toBeNull()
  })

  it('issues an invite, shows its link once with Copy, and clears the email', async () => {
    const u = setup()
    createInvite.mockResolvedValue({
      email: 'new.person@example.test',
      role: 'analyst',
      expiresAt: '2026-11-26T09:00:00Z',
      token: TOKEN,
    })
    renderPage()
    await screen.findByText('Bob Reporter')
    // The role hint tells the truth about each role.
    expect(screen.getByText(/only their own/i)).toBeTruthy()
    await u.type(screen.getByLabelText('Email'), 'new.person@example.test')
    await u.selectOptions(screen.getByLabelText('Role'), 'analyst')
    expect(screen.getByText(/sees and updates every incident/i)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Create invite' }))
    expect(createInvite).toHaveBeenCalledWith('new.person@example.test', 'analyst')
    const link = (await screen.findByRole('textbox', { name: 'Invite link' })) as HTMLTextAreaElement
    expect(link.value).toBe(`${window.location.origin}/invite#${TOKEN}`)
    await waitFor(() => expect(document.activeElement).toBe(link))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('')
    expect(screen.getByText(/works once/i).textContent).toMatch(/26 Nov 2026, 09:00 UTC/)

    await u.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite#${TOKEN}`)
    expect(await screen.findByText('Link copied.')).toBeTruthy()
  })

  it('drops the old invite link as soon as another invite is started', async () => {
    const u = setup()
    createInvite.mockResolvedValueOnce({ email: 'a@example.test', role: 'reporter', expiresAt: '2026-11-26T09:00:00Z', token: 'invite_one' })
    createInvite.mockRejectedValueOnce(new api.ApiError(409, 'that email already has an account'))
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.type(screen.getByLabelText('Email'), 'a@example.test')
    await u.click(screen.getByRole('button', { name: 'Create invite' }))
    await screen.findByRole('textbox', { name: 'Invite link' })
    await u.type(screen.getByLabelText('Email'), 'b@example.test')
    await u.click(screen.getByRole('button', { name: 'Create invite' }))
    expect((await screen.findByRole('alert')).textContent).toBe('that email already has an account')
    expect(screen.queryByRole('textbox', { name: 'Invite link' })).toBeNull()
    expect(document.body.textContent).not.toContain('invite_one')
    // Focus is back on the button so the person can fix the email and send again.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create invite' })))
  })

  it('says so and keeps the link selectable when Copy fails', async () => {
    const u = setup()
    writeText.mockRejectedValue(new Error('denied'))
    createInvite.mockResolvedValue({ email: 'a@example.test', role: 'reporter', expiresAt: '2026-11-26T09:00:00Z', token: TOKEN })
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.type(screen.getByLabelText('Email'), 'a@example.test')
    await u.click(screen.getByRole('button', { name: 'Create invite' }))
    const link = (await screen.findByRole('textbox', { name: 'Invite link' })) as HTMLTextAreaElement
    await u.click(screen.getByRole('button', { name: 'Copy link' }))
    expect((await screen.findByText(/could not copy automatically/i)).textContent).toMatch(/copy it by hand/)
    expect(document.activeElement).toBe(link)
    expect(link.selectionStart).toBe(0)
    expect(link.selectionEnd).toBe(link.value.length)
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })

  it('never writes a link to storage or the address bar, for a reset or an invite', async () => {
    const u = setup()
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    createPasswordReset.mockResolvedValue({ email: BOB.email, expiresAt: '2026-11-25T10:00:00Z', token: TOKEN })
    createInvite.mockResolvedValue({ email: 'a@example.test', role: 'reporter', expiresAt: '2026-11-26T09:00:00Z', token: 'invite-link-fixture' })
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    await screen.findByRole('textbox', { name: 'Password reset link' })
    await u.type(screen.getByLabelText('Email'), 'a@example.test')
    await u.click(screen.getByRole('button', { name: 'Create invite' }))
    await screen.findByRole('textbox', { name: 'Invite link' })
    expect(spy).not.toHaveBeenCalled()
    expect(window.location.href).not.toContain(TOKEN)
    expect(window.location.href).not.toContain('invite-link-fixture')
    expect(Object.keys(window.localStorage)).toEqual([])
    expect(Object.keys(window.sessionStorage)).toEqual([])
    spy.mockRestore()
  })

  it('re-issuing for the same person drops the old link, resets Copy and focuses the new link', async () => {
    const u = setup()
    createPasswordReset
      .mockResolvedValueOnce({ email: BOB.email, expiresAt: '2026-11-25T10:00:00Z', token: 'old_token' })
      .mockResolvedValueOnce({ email: BOB.email, expiresAt: '2026-11-25T11:00:00Z', token: 'new_token' })
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    await screen.findByRole('textbox', { name: 'Password reset link' })
    await u.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByText('Link copied.')).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Password reset link' }) as HTMLTextAreaElement).value).toContain('new_token'))
    expect(document.body.textContent).not.toContain('old_token')
    expect(screen.queryByText('Link copied.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Password reset link' })))
  })

  it('a failed re-issue says the link shown before still works, and puts focus back on Reset', async () => {
    const u = setup()
    createPasswordReset
      .mockResolvedValueOnce({ email: BOB.email, expiresAt: '2026-11-25T10:00:00Z', token: 'first-link-fixture' })
      .mockRejectedValueOnce(new api.ApiError(500, 'Could not create the reset link'))
    renderPage()
    await screen.findByText('Bob Reporter')
    const reset = () => screen.getByRole('button', { name: 'Reset password for Bob Reporter' })
    await u.click(reset())
    await screen.findByRole('textbox', { name: 'Password reset link' })

    await u.click(reset())
    const alert = await screen.findByRole('alert')
    // The server rolled the new link back, so the old one was never replaced: say so plainly.
    expect(alert.textContent).toBe(
      'Could not create the reset link. The link shown before was not replaced: it still works until it expires.',
    )
    expect(screen.queryByRole('textbox', { name: 'Password reset link' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(reset()))
    expect(reset().getAttribute('aria-describedby')).toBe(alert.id)
  })

  it('a re-issue that never reaches the server does not promise the old link still works', async () => {
    const u = setup()
    createPasswordReset
      .mockResolvedValueOnce({ email: BOB.email, expiresAt: '2026-11-25T10:00:00Z', token: 'first-link-fixture' })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    await screen.findByRole('textbox', { name: 'Password reset link' })
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/may have stopped working/)
    expect(alert.textContent).not.toMatch(/still works/)
  })

  it('a failed first reset puts focus back on Reset', async () => {
    const u = setup()
    createPasswordReset.mockRejectedValueOnce(new api.ApiError(404, 'user not found'))
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    expect((await screen.findByRole('alert')).textContent).toBe('user not found')
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset password for Bob Reporter' })),
    )
  })

  it('shows a cue while the chosen role differs from the saved one', async () => {
    const u = setup()
    renderPage()
    await screen.findByText('Bob Reporter')
    expect(screen.queryByText(/not saved until you press save/i)).toBeNull()
    await u.selectOptions(roleSelect('Bob Reporter'), 'admin')
    const cue = screen.getByText(/currently reporter/i)
    expect(roleSelect('Bob Reporter').getAttribute('aria-describedby')).toContain(cue.id)
    await u.selectOptions(roleSelect('Bob Reporter'), 'reporter')
    expect(screen.queryByText(/currently reporter/i)).toBeNull()
  })

  it('ties a failed invite to the email field and a failed reset to its button', async () => {
    const u = setup()
    createInvite.mockRejectedValue(new api.ApiError(409, 'that email already has an account'))
    createPasswordReset.mockRejectedValue(new api.ApiError(404, 'user not found'))
    renderPage()
    await screen.findByText('Bob Reporter')
    await u.type(screen.getByLabelText('Email'), 'a@example.test')
    await u.click(screen.getByRole('button', { name: 'Create invite' }))
    const inviteError = await screen.findByText('that email already has an account')
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(inviteError.id)
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    const resetError = await screen.findByText('user not found')
    expect(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }).getAttribute('aria-describedby')).toBe(resetError.id)
  })
})

describe('Users motion', () => {
  it('shows the list and a new link at once under reduced motion', async () => {
    const u = setup()
    setMatchMedia(REDUCE, true)
    createPasswordReset.mockResolvedValue({ email: BOB.email, expiresAt: '2026-11-25T10:00:00Z', token: TOKEN })
    renderPage()
    const name = await screen.findByText('Bob Reporter')
    expectShownAtOnce(name.closest('ul') as HTMLElement)
    // The link has no animation of its own; the list is the part that could hide on frame one.
    await u.click(screen.getByRole('button', { name: 'Reset password for Bob Reporter' }))
    await screen.findByRole('textbox', { name: 'Password reset link' })
    expectShownAtOnce(screen.getByText('Bob Reporter').closest('ul') as HTMLElement)
  })
})
