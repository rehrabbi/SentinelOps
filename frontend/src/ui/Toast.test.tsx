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
  it('shows messages in one polite live region', () => {
    render(<Toaster />)
    act(() => {
      toast('Incident INC-0142 saved', 'success')
      toast('Could not reach the server. Try again.', 'error')
    })
    const regions = screen.getAllByRole('status')
    expect(regions).toHaveLength(1)
    expect(regions[0].getAttribute('aria-live')).toBe('polite')
    // New toasts are read on their own; older ones and removals are not re-read.
    expect(regions[0].getAttribute('aria-atomic')).toBe('false')
    expect(regions[0].getAttribute('aria-relevant')).toBe('additions')
    expect(within(regions[0]).getByText('Incident INC-0142 saved')).toBeTruthy()
    expect(within(regions[0]).getByText('Could not reach the server. Try again.')).toBeTruthy()
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

  it('dismisses itself after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<Toaster />)
    act(() => toast('Signed out'))
    act(() => vi.advanceTimersByTime(10_000))
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('Signed out')).toBeNull())
  })
})
