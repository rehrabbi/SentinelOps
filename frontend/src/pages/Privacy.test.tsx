import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce } from '../test/visibility'

// The notice as it is routed: <App/> at "/privacy" with nobody signed in, so it sits in the public
// shell with the footer a visitor sees.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, getMe: vi.fn().mockResolvedValue(null) }
})

import App from '../App'

async function renderPrivacy() {
  render(
    <MemoryRouter initialEntries={['/privacy']}>
      <App />
    </MemoryRouter>,
  )
  return screen.findByRole('heading', { level: 1 })
}

describe('privacy notice', () => {
  it('has exactly one h1, then h2 sections', async () => {
    await renderPrivacy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })[0].textContent).toBe('Privacy')
    const h2 = within(screen.getByRole('main')).getAllByRole('heading', { level: 2 })
    expect(h2.length).toBeGreaterThanOrEqual(8)
  })

  it('names each stored item', async () => {
    await renderPrivacy()
    const text = screen.getByRole('main').textContent ?? ''
    for (const item of [
      /email address/i,
      /bcrypt hash/i,
      /incidents/i,
      /SHA-256 hash/,
      /7 days/,
      /24 hours/,
      /1 hour/,
      /audit log/i,
      /IP address/i,
      /cannot be erased on request/i,
      /one log line for every request/i,
      /cookies, request headers, query strings/i,
      /90 days/,
      /encrypted with\s+age/i,
      /sentinelops_session/,
      /sentinelops\.theme/,
      /does not send email/i,
    ]) {
      expect(text, String(item)).toMatch(item)
    }
  })

  it('names each host and says there are no analytics', async () => {
    await renderPrivacy()
    const text = screen.getByRole('main').textContent ?? ''
    for (const host of ['Cloudflare', 'Render', 'Neon', 'GitHub', 'Backblaze']) {
      expect(text, host).toContain(host)
    }
    expect(text).toMatch(/no analytics/i)
    expect(text).toMatch(/no trackers/i)
  })

  it('has a last-updated date', async () => {
    await renderPrivacy()
    const time = screen.getByRole('main').querySelector('time')
    expect(time?.getAttribute('datetime')).toBe('2026-11-25')
  })

  it('links only to the repository from the page itself', async () => {
    await renderPrivacy()
    const links = within(screen.getByRole('main')).queryAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\/github\.com\/rehrabbi\/SentinelOps/)
    }
  })

  it('makes no legal claims and offers no terms of service', async () => {
    await renderPrivacy()
    const text = screen.getByRole('main').textContent ?? ''
    for (const banned of [/GDPR/, /CCPA/, /terms of service/i, /take your privacy/i]) {
      expect(text, String(banned)).not.toMatch(banned)
    }
  })

  it('says what the audit log and backups really hold', async () => {
    await renderPrivacy()
    const text = (screen.getByRole('main').textContent ?? '').replace(/ +/g, ' ')
    for (const item of [
      /email address of the person an invite, role change or password reset was for/i,
      /even if they never created an account/i,
      /reset holds the account it is for/i,
      /when there are new entries/i,
      /any signed-in GitHub user can download/i,
      /about 90 days/,
      /rolling 6 hour history/i,
      /Administrators can see each account’s email, name and role/i,
      /not correct or delete anything/i,
      /Deleting an account is not currently supported/i,
      /do not put your email address or anything about your account/i,
    ]) {
      expect(text, String(item)).toMatch(item)
    }
  })

  it('control: with motion on, the shown-at-once check fails, so the reduced-motion check means something', async () => {
    setMatchMedia('(prefers-reduced-motion: reduce)', false)
    const h1 = await renderPrivacy()
    const article = screen.getByRole('main').querySelector<HTMLElement>('.privacy') as HTMLElement
    expect(article.style.opacity).toBe('0')
    expect(() => expectShownAtOnce(h1, article)).toThrow()
  })

  it('under reduced motion shows the whole page on the first render', async () => {
    setMatchMedia('(prefers-reduced-motion: reduce)', true)
    const h1 = await renderPrivacy()
    const main = screen.getByRole('main')
    const h2 = within(main).getAllByRole('heading', { level: 2 })
    const article = main.querySelector<HTMLElement>('.privacy')
    expect(article).not.toBeNull()
    expectShownAtOnce(h1, article as HTMLElement, ...h2)
  })
})
