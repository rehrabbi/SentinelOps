import { render, screen, waitFor, within } from '@testing-library/react'
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

  it('shows the server message in an alert when loading fails, and no overview', async () => {
    getIncidents.mockRejectedValue(new api.ApiError(500, 'The incident service is down'))
    const { container } = render(<Incidents />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('The incident service is down')
    expect(container.querySelector('.overview')).toBeNull()
  })

  it('falls back to a plain message when the failure is not an API error', async () => {
    getIncidents.mockRejectedValue(new Error('boom'))
    render(<Incidents />)
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to load incidents')
  })

  it('shows the empty state when there are no incidents', async () => {
    getIncidents.mockResolvedValue([])
    render(<Incidents />)
    expect(await screen.findByRole('heading', { name: 'No incidents yet' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: '' })).toBeNull()
  })

  it('lists incidents with severity, status and times, newest first as the server sent them', async () => {
    getIncidents.mockResolvedValue([
      incident('2', 'Disk almost full', 'investigating', 'high', {
        description: 'The /var volume is at 94%.',
        updatedAt: '2026-11-21T10:30:00Z',
      }),
      incident('1', 'Login page slow', 'open', 'low'),
    ])
    render(<Incidents />)
    await screen.findByText('Disk almost full')
    expect(rowTitles()).toEqual(['Disk almost full', 'Login page slow'])
    expect(screen.getByText('The /var volume is at 94%.')).toBeTruthy()
    expect(screen.getAllByText('Reported 20 Nov 2026, 09:00 UTC', { selector: 'time' })).toHaveLength(2)
    expect(screen.getByText('Updated 21 Nov 2026, 10:30 UTC', { selector: 'time' })).toBeTruthy()
    // The row for an untouched incident has no "Updated" time.
    expect(screen.getAllByText(/^Updated /)).toHaveLength(1)
    const select = screen.getByRole('combobox', { name: 'Status for Disk almost full' }) as HTMLSelectElement
    expect(select.value).toBe('investigating')
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

describe('Reporting an incident', () => {
  it('sends title, description and severity, adds the incident at the top as open, and updates the overview', async () => {
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

    await user.type(screen.getByLabelText('Title'), 'Payments failing')
    await user.type(screen.getByLabelText('Description'), 'Card checkout returns 500.')
    await user.selectOptions(screen.getByLabelText('Severity'), 'critical')
    await user.click(screen.getByRole('button', { name: 'Report incident' }))

    await waitFor(() => expect(rowTitles()).toEqual(['Payments failing', 'Login page slow']))
    expect(createIncident).toHaveBeenCalledWith({
      title: 'Payments failing',
      description: 'Card checkout returns 500.',
      severity: 'critical',
    })
    const row = screen.getByText('Payments failing').closest('li') as HTMLElement
    expect(within(row).getByText('open', { selector: '.ui-badge-status .ui-badge-word' })).toBeTruthy()
    await waitFor(() => expect(openCount(container)).toBe('2 open or investigating'))
    // The form is cleared, ready for the next one, and a toast confirms.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Severity') as HTMLSelectElement).value).toBe('medium')
    expect(await screen.findByText('Incident reported')).toBeTruthy()
  })

  it('sends the default severity when none is chosen', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([])
    createIncident.mockResolvedValue(incident('1', 'Printer offline'))
    render(<Incidents />)
    await screen.findByRole('heading', { name: 'No incidents yet' })
    await user.type(screen.getByLabelText('Title'), 'Printer offline')
    await user.click(screen.getByRole('button', { name: 'Report incident' }))
    await waitFor(() =>
      expect(createIncident).toHaveBeenCalledWith({ title: 'Printer offline', description: '', severity: 'medium' }),
    )
    // The empty state gives way to the list.
    await screen.findByText('Printer offline', { selector: '.incidents-title' })
    expect(screen.queryByRole('heading', { name: 'No incidents yet' })).toBeNull()
  })

  it('keeps what was typed and shows the server message when creating fails', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([])
    createIncident.mockRejectedValue(new api.ApiError(400, 'title is required'))
    render(<Incidents />)
    await screen.findByRole('heading', { name: 'No incidents yet' })
    await user.type(screen.getByLabelText('Title'), 'Something')
    await user.click(screen.getByRole('button', { name: 'Report incident' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('title is required')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Something')
  })
})

describe('Changing a status', () => {
  it('calls updateIncident, shows the new badge and moves the overview count', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow', 'open', 'high')])
    updateIncident.mockResolvedValue(incident('1', 'Login page slow', 'resolved', 'high'))
    const { container } = render(<Incidents />)
    await screen.findByText('Login page slow')
    expect(openCount(container)).toBe('1 open or investigating')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status for Login page slow' }), 'resolved')

    expect(updateIncident).toHaveBeenCalledWith('1', { status: 'resolved' })
    const row = screen.getByText('Login page slow').closest('li') as HTMLElement
    await waitFor(() =>
      expect(within(row).getByText('resolved', { selector: '.ui-badge-status .ui-badge-word' })).toBeTruthy(),
    )
    expect((within(row).getByRole('combobox') as HTMLSelectElement).value).toBe('resolved')
    await waitFor(() => expect(openCount(container)).toBe('0 open or investigating'))
  })

  it('restores the previous status and shows the server message on that row when the update fails', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([
      incident('1', 'Login page slow', 'investigating'),
      incident('2', 'Disk almost full', 'open'),
    ])
    updateIncident.mockRejectedValue(new api.ApiError(404, 'incident not found'))
    render(<Incidents />)
    await screen.findByText('Login page slow')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status for Login page slow' }), 'closed')

    const row = screen.getByText('Login page slow').closest('li') as HTMLElement
    const alert = await within(row).findByRole('alert')
    expect(alert.textContent).toBe('incident not found')
    const select = within(row).getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('investigating')
    expect(select.disabled).toBe(false)
    expect(within(row).getByText('investigating', { selector: '.ui-badge-status .ui-badge-word' })).toBeTruthy()
    // The other row is untouched and shows no error.
    const other = screen.getByText('Disk almost full').closest('li') as HTMLElement
    expect(within(other).queryByRole('alert')).toBeNull()
  })

  it('clears an earlier row error when the next change goes through', async () => {
    const user = userEvent.setup()
    getIncidents.mockResolvedValue([incident('1', 'Login page slow', 'open')])
    updateIncident
      .mockRejectedValueOnce(new api.ApiError(500, 'internal server error'))
      .mockResolvedValueOnce(incident('1', 'Login page slow', 'closed'))
    render(<Incidents />)
    await screen.findByText('Login page slow')
    const select = screen.getByRole('combobox', { name: 'Status for Login page slow' })
    await user.selectOptions(select, 'closed')
    await screen.findByRole('alert')
    await user.selectOptions(select, 'closed')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('Incidents motion', () => {
  it('shows a new incident at once under reduced motion', async () => {
    const user = userEvent.setup()
    setMatchMedia(REDUCE, true)
    getIncidents.mockResolvedValue([incident('1', 'Login page slow')])
    createIncident.mockResolvedValue(incident('2', 'Payments failing'))
    render(<Incidents />)
    await screen.findByText('Login page slow')
    await user.type(screen.getByLabelText('Title'), 'Payments failing')
    await user.click(screen.getByRole('button', { name: 'Report incident' }))
    const added = await screen.findByText('Payments failing', { selector: '.incidents-title' })
    // On the first frame: no inline opacity 0, no transform, nothing hidden.
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
