import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Incident, IncidentSeverity, IncidentStatus } from '../api'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce } from '../test/visibility'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    getIncidents: vi.fn(),
    createIncident: vi.fn(),
    updateIncident: vi.fn(),
  }
})

import * as api from '../api'
import { Toaster } from '../ui/Toast'
import { clearToasts } from '../ui/toast-store'
import { Incidents } from './Incidents'

const REDUCE = '(prefers-reduced-motion: reduce)'
const getIncidents = vi.mocked(api.getIncidents)
const createIncident = vi.mocked(api.createIncident)
const updateIncident = vi.mocked(api.updateIncident)

function incident(
  id: string,
  title: string,
  status: IncidentStatus = 'open',
  severity: IncidentSeverity = 'medium',
  extra: Partial<Incident> = {},
): Incident {
  return {
    id,
    userId: 'u-1',
    title,
    description: '',
    status,
    severity,
    createdAt: '2026-11-20T09:00:00Z',
    updatedAt: '2026-11-20T09:00:00Z',
    ...extra,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** The first headline count, e.g. "3 open or investigating". */
function openCount(container: HTMLElement): string {
  return container.querySelector('.overview-stat')?.textContent ?? ''
}

function rowTitles(): string[] {
  return screen.getAllByRole('listitem').flatMap((li) => {
    const t = li.querySelector('.incidents-title')
    return t ? [t.textContent ?? ''] : []
  })
}

function rowOf(title: string): HTMLElement {
  return screen.getByText(title, { selector: '.incidents-title' }).closest('li') as HTMLElement
}

function statusSelect(title: string): HTMLSelectElement {
  return screen.getByRole('combobox', { name: `Status for ${title}` }) as HTMLSelectElement
}

const toggle = () => screen.getByRole('button', { name: 'Report an incident' })

beforeEach(() => {
  vi.resetAllMocks()
  clearToasts()
  setMatchMedia(REDUCE, true)
})

describe('Incidents page states', () => {
  it('has one h1 and shows a loading note before data, with no overview', () => {
    getIncidents.mockReturnValue(new Promise(() => {}))
    const { container } = render(<Incidents />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Incidents' })).toBeTruthy()
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Loading incidents')
    expect(container.querySelector('.overview')).toBeNull()
  })

  it('shows the server message in an alert when loading fails, with Retry and no overview', async () => {
    getIncidents.mockRejectedValue(new api.ApiError(500, 'The incident service is down'))
    const { container } = render(<Incidents />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('The incident service is down')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(container.querySelector('.overview')).toBeNull()
  })

  it('falls back to a plain message when the failure is not an API error', async () => {
    getIncidents.mockRejectedValue(new Error('boom'))
    render(<Incidents />)
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to load incidents')
  })

  it('shows the empty state, with the report form open, when there are no incidents', async () => {
    getIncidents.mockResolvedValue([])
    render(<Incidents />)
    expect(await screen.findByRole('heading', { name: 'No incidents yet' })).toBeTruthy()
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Title')).toBeTruthy()
    // Opening by default does not take focus from where it was.
    expect(document.activeElement).toBe(document.body)
  })

  it('names the list for every role, and lists incidents with severity, status and times', async () => {
    getIncidents.mockResolvedValue([
      incident('2', 'Disk almost full', 'investigating', 'high', {
        description: 'The /var volume is at 94%.',
        updatedAt: '2026-11-21T10:30:00Z',
      }),
      incident('1', 'Login page slow', 'open', 'low'),
    ])
    render(<Incidents />)
    await screen.findByText('Disk almost full')
    expect(screen.getByRole('heading', { level: 2, name: 'Incidents you can see' })).toBeTruthy()
    expect(rowTitles()).toEqual(['Disk almost full', 'Login page slow'])
    expect(screen.getByText('The /var volume is at 94%.')).toBeTruthy()
    expect(screen.getAllByText('Reported 20 Nov 2026, 09:00 UTC', { selector: 'time' })).toHaveLength(2)
    expect(screen.getByText('Updated 21 Nov 2026, 10:30 UTC', { selector: 'time' })).toBeTruthy()
    expect(screen.getAllByText(/^Updated /)).toHaveLength(1)
    expect(statusSelect('Disk almost full').value).toBe('investigating')
    // Severity is a badge; status is shown once, in the select (no second status badge).
    expect(within(rowOf('Disk almost full')).getByText('high', { selector: '.ui-badge-word' })).toBeTruthy()
    expect(document.querySelector('.incidents-list .ui-badge-status')).toBeNull()
    // The form is closed when there is a list to read.
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Title')).toBeNull()
  })

  it('leaves out "Updated" when the two times only differ by seconds', async () => {
    getIncidents.mockResolvedValue([
      incident('1', 'Login page slow', 'open', 'low', {
        createdAt: '2026-11-20T09:00:05Z',
        updatedAt: '2026-11-20T09:00:41Z',
      }),
    ])
    render(<Incidents />)
    await screen.findByText('Login page slow')
    expect(screen.queryByText(/^Updated /)).toBeNull()
  })

  it('renders a 200-character title inside its row, set to wrap', async () => {
    const long = 'x'.repeat(200)
    getIncidents.mockResolvedValue([incident('1', long)])
    render(<Incidents />)
    const title = await screen.findByText(long)
    // jsdom has no layout, so assert the class that carries the wrapping rule, and that the
    // text sits inside the row rather than outside the list.
    expect(title.className).toBe('incidents-title')
    expect(title.closest('li.incidents-row')).toBeTruthy()
  })
})

describe('A failed load', () => {
  it('keeps the error and shows no overview after a create, then Retry brings in the server list', async () => {
    const user = userEvent.setup()
    getIncidents.mockRejectedValueOnce(new api.ApiError(503, 'The incident service is down'))
    createIncident.mockResolvedValue(incident('9', 'Payments failing'))
    const { container } = render(
      <>
        <Incidents />
        <Toaster />
      </>,
    )
    await screen.findByText('The incident service is down')

    await user.click(toggle())
    await user.type(screen.getByLabelText('Title'), 'Payments failing')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))

    // The create worked and says so, but there is still no list, so no overview and no faked rows.
    expect(await screen.findByText('Incident reported')).toBeTruthy()
    expect(screen.getByText('The incident service is down')).toBeTruthy()
    expect(container.querySelector('.overview')).toBeNull()
    expect(document.querySelector('.incidents-list')).toBeNull()

    getIncidents.mockResolvedValueOnce([
      incident('9', 'Payments failing'),
      incident('1', 'Login page slow', 'closed', 'low'),
    ])
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Payments failing', { selector: '.incidents-title' })
    expect(screen.queryByText('The incident service is down')).toBeNull()
    expect(screen.getByText('Counts cover the 2 incidents you can see.')).toBeTruthy()
    expect(openCount(container)).toBe('1 open or investigating')
    expect(getIncidents).toHaveBeenCalledTimes(2)
  })

  it('shows the error again if Retry fails', async () => {
    const user = userEvent.setup()
    getIncidents
      .mockRejectedValueOnce(new api.ApiError(503, 'The incident service is down'))
      .mockRejectedValueOnce(new api.ApiError(503, 'Still down'))
    render(<Incidents />)
    await screen.findByText('The incident service is down')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Still down')
  })

  it('shows a new incident once when Retry already brought it in before the create answered', async () => {
    const user = userEvent.setup()
    const created = deferred<Incident>()
    getIncidents.mockRejectedValueOnce(new api.ApiError(503, 'The incident service is down'))
    createIncident.mockReturnValue(created.promise)
    render(<Incidents />)
    await screen.findByText('The incident service is down')

    await user.click(toggle())
    await user.type(screen.getByLabelText('Title'), 'Payments failing')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))

    // The reload lands first and already holds the new incident; then the create answers.
    getIncidents.mockResolvedValueOnce([incident('9', 'Payments failing')])
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Payments failing', { selector: '.incidents-title' })
    await act(async () => created.resolve(incident('9', 'Payments failing')))

    expect(rowTitles()).toEqual(['Payments failing'])
  })
})

describe('Reporting an incident', () => {
  it('opens in place with focus on Title, sends the payload, then closes, returns focus and updates the overview', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow', 'open', 'low')])
    createIncident.mockResolvedValue(
      incident('2', 'Payments failing', 'open', 'critical', { description: 'Card checkout returns 500.' }),
    )
    const { container } = render(
      <>
        <Incidents />
        <Toaster />
      </>,
    )
    await screen.findByText('Login page slow')
    expect(openCount(container)).toBe('1 open or investigating')

    await user.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    const controls = toggle().getAttribute('aria-controls')
    expect(controls && document.getElementById(controls)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))

    await user.type(screen.getByLabelText('Title'), 'Payments failing')
    await user.type(screen.getByLabelText('Description'), 'Card checkout returns 500.')
    // Option text is capitalised like the badges; the value sent stays lowercase.
    expect(within(screen.getByLabelText('Severity')).getByRole('option', { name: 'Critical' })).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Severity'), 'critical')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))

    await waitFor(() => expect(rowTitles()).toEqual(['Payments failing', 'Login page slow']))
    expect(createIncident).toHaveBeenCalledWith({
      title: 'Payments failing',
      description: 'Card checkout returns 500.',
      severity: 'critical',
    })
    const row = rowOf('Payments failing')
    expect(statusSelect('Payments failing').value).toBe('open')
    expect(row.querySelector('.incidents-status-open')).toBeTruthy()
    await waitFor(() => expect(openCount(container)).toBe('2 open or investigating'))
    // The form closes, focus returns to the button that opened it, and a toast confirms.
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle())
    expect(await screen.findByText('Incident reported')).toBeTruthy()
  })

  it('Cancel closes the form and returns focus to the button', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow')])
    render(<Incidents />)
    await screen.findByText('Login page slow')
    await user.click(toggle())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(document.activeElement).toBe(toggle())
    expect(createIncident).not.toHaveBeenCalled()
  })

  it('sends the default severity when none is chosen, and the empty state gives way to the list', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([])
    createIncident.mockResolvedValue(incident('1', 'Printer offline'))
    render(<Incidents />)
    await screen.findByRole('heading', { name: 'No incidents yet' })
    await user.type(screen.getByLabelText('Title'), 'Printer offline')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))
    await waitFor(() =>
      expect(createIncident).toHaveBeenCalledWith({ title: 'Printer offline', description: '', severity: 'medium' }),
    )
    await screen.findByText('Printer offline', { selector: '.incidents-title' })
    expect(screen.queryByRole('heading', { name: 'No incidents yet' })).toBeNull()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('disables the submit button while sending, and does not send twice', async () => {
    const user = userEvent.setup()
    const pending = deferred<Incident>()
    getIncidents.mockResolvedValue([])
    createIncident.mockReturnValue(pending.promise)
    render(<Incidents />)
    await screen.findByRole('heading', { name: 'No incidents yet' })
    await user.type(screen.getByLabelText('Title'), 'Printer offline')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))

    const sending = screen.getByRole('button', { name: 'Creating…' }) as HTMLButtonElement
    expect(sending.disabled).toBe(true)
    expect(sending.getAttribute('aria-busy')).toBe('true')
    await user.click(sending)
    expect(createIncident).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve(incident('1', 'Printer offline')))
    await screen.findByText('Printer offline', { selector: '.incidents-title' })
  })

  it('keeps what was typed, shows the server message and puts focus on the button when creating fails', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([])
    createIncident.mockRejectedValue(new api.ApiError(400, 'title is required'))
    render(<Incidents />)
    await screen.findByRole('heading', { name: 'No incidents yet' })
    await user.type(screen.getByLabelText('Title'), 'Something')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('title is required')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Something')
    const submit = screen.getByRole('button', { name: 'Create incident' })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    expect(document.activeElement).toBe(submit)
  })
})

describe('Changing a status', () => {
  it('calls updateIncident, shows the new status once, moves the overview count and keeps focus', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow', 'open', 'high')])
    updateIncident.mockResolvedValue(incident('1', 'Login page slow', 'resolved', 'high'))
    const { container } = render(<Incidents />)
    await screen.findByText('Login page slow')
    expect(openCount(container)).toBe('1 open or investigating')

    await user.selectOptions(statusSelect('Login page slow'), 'resolved')

    expect(updateIncident).toHaveBeenCalledWith('1', { status: 'resolved' })
    const row = rowOf('Login page slow')
    await waitFor(() => expect(row.querySelector('.incidents-status-resolved')).toBeTruthy())
    expect(statusSelect('Login page slow').value).toBe('resolved')
    expect(within(row).getByRole('option', { name: 'Resolved', selected: true })).toBeTruthy()
    await waitFor(() => expect(openCount(container)).toBe('0 open or investigating'))
    expect(document.activeElement).toBe(statusSelect('Login page slow'))
  })

  it('marks the row busy and says "Saving…" to screen readers while the update is in flight', async () => {
    const user = userEvent.setup()
    const pending = deferred<Incident>()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow')])
    updateIncident.mockReturnValue(pending.promise)
    render(<Incidents />)
    await screen.findByText('Login page slow')
    const row = rowOf('Login page slow')
    expect(row.getAttribute('aria-busy')).toBeNull()

    await user.selectOptions(statusSelect('Login page slow'), 'closed')
    expect(row.getAttribute('aria-busy')).toBe('true')
    expect(within(row).getByRole('status').textContent).toBe('Saving…')
    expect(statusSelect('Login page slow').disabled).toBe(true)

    await act(async () => pending.resolve(incident('1', 'Login page slow', 'closed')))
    await waitFor(() => expect(row.getAttribute('aria-busy')).toBeNull())
    expect(within(row).getByRole('status').textContent).toBe('')
  })

  it('restores the previous status and shows the server message, tied to the select, when the update fails', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([
      incident('1', 'Login page slow', 'investigating'),
      incident('2', 'Disk almost full', 'open'),
    ])
    updateIncident.mockRejectedValue(new api.ApiError(404, 'incident not found'))
    render(<Incidents />)
    await screen.findByText('Login page slow')

    await user.selectOptions(statusSelect('Login page slow'), 'closed')

    const row = rowOf('Login page slow')
    const alert = await within(row).findByRole('alert')
    expect(alert.textContent).toBe('incident not found')
    const select = statusSelect('Login page slow')
    expect(select.value).toBe('investigating')
    expect(select.disabled).toBe(false)
    expect(row.querySelector('.incidents-status-investigating')).toBeTruthy()
    expect(select.getAttribute('aria-describedby')).toBe(alert.id)
    expect(alert.id).not.toBe('')
    expect(document.activeElement).toBe(select)
    // The other row is untouched and shows no error.
    const other = rowOf('Disk almost full')
    expect(within(other).queryByRole('alert')).toBeNull()
    expect(statusSelect('Disk almost full').getAttribute('aria-describedby')).toBeNull()
  })

  it('clears an earlier row error when the next change goes through', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow', 'open')])
    updateIncident
      .mockRejectedValueOnce(new api.ApiError(500, 'internal server error'))
      .mockResolvedValueOnce(incident('1', 'Login page slow', 'closed'))
    render(<Incidents />)
    await screen.findByText('Login page slow')
    await user.selectOptions(statusSelect('Login page slow'), 'closed')
    await screen.findByRole('alert')
    await user.selectOptions(statusSelect('Login page slow'), 'closed')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(statusSelect('Login page slow').getAttribute('aria-describedby')).toBeNull()
  })

  it('handles two rows updating at once: each ends with its own server result', async () => {
    const user = userEvent.setup()
    const first = deferred<Incident>()
    const second = deferred<Incident>()
    getIncidents.mockResolvedValue([
      incident('1', 'Login page slow', 'open'),
      incident('2', 'Disk almost full', 'investigating'),
    ])
    updateIncident.mockImplementation((id) => (id === '1' ? first.promise : second.promise))
    const { container } = render(<Incidents />)
    await screen.findByText('Login page slow')
    expect(openCount(container)).toBe('2 open or investigating')

    await user.selectOptions(statusSelect('Login page slow'), 'resolved')
    await user.selectOptions(statusSelect('Disk almost full'), 'closed')
    expect(statusSelect('Login page slow').disabled).toBe(true)
    expect(statusSelect('Disk almost full').disabled).toBe(true)

    // They come back in the opposite order.
    await act(async () => second.resolve(incident('2', 'Disk almost full', 'closed')))
    await act(async () => first.resolve(incident('1', 'Login page slow', 'resolved')))

    await waitFor(() => expect(statusSelect('Login page slow').value).toBe('resolved'))
    expect(statusSelect('Disk almost full').value).toBe('closed')
    expect(statusSelect('Login page slow').disabled).toBe(false)
    expect(statusSelect('Disk almost full').disabled).toBe(false)
    expect(rowTitles()).toEqual(['Login page slow', 'Disk almost full'])
    await waitFor(() => expect(openCount(container)).toBe('0 open or investigating'))
  })
})

describe('Incidents motion', () => {
  it('shows the form and a new incident at once under reduced motion', async () => {
    const user = userEvent.setup()
    setMatchMedia(REDUCE, true)
    getIncidents.mockResolvedValue([incident('1', 'Login page slow')])
    createIncident.mockResolvedValue(incident('2', 'Payments failing'))
    render(<Incidents />)
    await screen.findByText('Login page slow')
    await user.click(toggle())
    // On the first frame: no inline opacity 0, no transform, nothing hidden.
    expectShownAtOnce(screen.getByLabelText('Title').closest('section') as HTMLElement)
    await user.type(screen.getByLabelText('Title'), 'Payments failing')
    await user.click(screen.getByRole('button', { name: 'Create incident' }))
    const added = await screen.findByText('Payments failing', { selector: '.incidents-title' })
    expectShownAtOnce(added.closest('li') as HTMLElement)
  })

  it('keeps the rows present on load visible with motion on, too', async () => {
    setMatchMedia(REDUCE, false)
    getIncidents.mockResolvedValue([incident('1', 'Login page slow')])
    render(<Incidents />)
    const title = await screen.findByText('Login page slow')
    expectShownAtOnce(title.closest('li') as HTMLElement)
  })
})
