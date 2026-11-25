import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from './Toast'
import { clearToasts, toast } from './toast-store'

afterEach(() => {
  act(() => clearToasts())
  vi.useRealTimers()
})

describe('toast', () => {
  it('shows every toast in a labelled list, and announces only the newest in one polite region', () => {
    render(<Toaster />)
    act(() => {
      toast('Incident INC-0142 saved', 'success')
      toast('Could not reach the server. Try again.', 'error')
    })
    const list = screen.getByRole('list', { name: 'Notifications' })
    expect(within(list).getByText('Incident INC-0142 saved')).toBeTruthy()
    expect(within(list).getByText('Could not reach the server. Try again.')).toBeTruthy()

    const regions = screen.getAllByRole('status')
    expect(regions).toHaveLength(1)
    // role="status" is polite and atomic: it reads its whole (one-message) content.
    expect(regions[0].textContent).toBe('Error: Could not reach the server. Try again.')
  })

  it('never re-reads an older toast when the newest goes', async () => {
    render(<Toaster />)
    act(() => {
      toast('Incident reported', 'success')
      toast('Maria Santos is now analyst', 'success')
    })
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('Done: Maria Santos is now analyst')
    const dismissNewest = screen.getAllByRole('button', { name: 'Dismiss' })[1]
    await userEvent.click(dismissNewest)
    await waitFor(() => expect(screen.queryByText('Maria Santos is now analyst')).toBeNull())
    expect(region.textContent).toBe('')
  })

  it('reads a repeated message again, as a new announcement', () => {
    render(<Toaster />)
    act(() => toast('Incident reported', 'success'))
    const first = screen.getByRole('status').firstElementChild
    act(() => toast('Incident reported', 'success'))
    const second = screen.getByRole('status').firstElementChild
    expect(second?.textContent).toBe('Done: Incident reported')
    expect(second).not.toBe(first)
  })

  it('does not announce toasts that were already showing when it mounted', () => {
    act(() => toast('Incident reported', 'success'))
    render(<Toaster />)
    expect(screen.getByText('Incident reported')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('names the kind in words, not only colour', () => {
    render(<Toaster />)
    act(() => toast('Could not reach the server.', 'error'))
    const item = screen.getByText('Could not reach the server.').closest('li')
    expect(item?.textContent).toContain('Error:')
    expect(item?.classList.contains('ui-toast-error')).toBe(true)
  })

  it('defaults to info', () => {
    render(<Toaster />)
    act(() => toast('Signed out'))
    expect(screen.getByText('Signed out').closest('li')?.classList.contains('ui-toast-info')).toBe(true)
  })

  it('can be dismissed', async () => {
    render(<Toaster />)
    act(() => toast('Invite link copied', 'success'))
    // Named "Dismiss" (so the live region does not read the message twice) and described by
    // the message, so each dismiss button still says which toast it closes.
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(dismiss.getAttribute('aria-describedby') ?? '')?.textContent).toContain(
      'Invite link copied',
    )
    await userEvent.click(dismiss)
    await waitFor(() => expect(screen.queryByText('Invite link copied')).toBeNull())
  })

  it('never dismisses an error by itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<Toaster />)
    act(() => toast('Could not save the incident.', 'error'))
    act(() => vi.advanceTimersByTime(10 * 60_000))
    vi.useRealTimers()
    expect(screen.getByText('Could not save the incident.')).toBeTruthy()
  })

  it('dismisses itself after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<Toaster />)
    act(() => toast('Signed out'))
    act(() => vi.advanceTimersByTime(10_000))
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('Signed out')).toBeNull())
  })
})
