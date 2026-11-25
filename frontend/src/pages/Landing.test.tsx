import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMatchMedia } from '../test/setup'
import { expectShownAtOnce, isShown } from '../test/visibility'

// The landing page as it is routed: <App/> at "/" with nobody signed in, so the page sits in the
// public shell with its header and footer, exactly as a visitor sees it.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, getMe: vi.fn().mockResolvedValue(null) }
})

import App from '../App'

const REPO = 'https://github.com/rehrabbi/SentinelOps'

async function renderLanding() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
  // App asks the server for a session first; the landing page renders once it hears "nobody".
  return screen.findByRole('heading', { level: 1 })
}

function inviteButton() {
  return screen.getByRole('button', { name: 'Have an invite?' })
}

function panelOf(button: HTMLElement) {
  const id = button.getAttribute('aria-controls')
  expect(id, 'aria-controls').toBeTruthy()
  const panel = document.getElementById(id as string)
  expect(panel, 'the controlled panel exists').not.toBeNull()
  return panel as HTMLElement
}

/** An IntersectionObserver that never reports anything: the page as it is before any scrolling. */
class SilentObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

/** The scroll-revealed blocks: the workflow steps and the safeguard groups. */
function gatedBlocks(main: HTMLElement) {
  const steps = within(main).getAllByRole('listitem').filter((li) => li.matches('.landing-flow-step'))
  const groups = [...main.querySelectorAll<HTMLElement>('.landing-guard-group')]
  expect(steps).toHaveLength(3)
  expect(groups).toHaveLength(4)
  return [...steps, ...groups]
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('landing page', () => {
  it('has exactly one h1', async () => {
    await renderLanding()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('has a "Sign in" link to /signin in the page itself, not only in the header', async () => {
    await renderLanding()
    const main = screen.getByRole('main')
    const inPage = within(main).getAllByRole('link', { name: 'Sign in' })
    expect(inPage.length).toBeGreaterThan(0)
    for (const link of screen.getAllByRole('link', { name: 'Sign in' })) {
      expect(link.getAttribute('href')).toBe('/signin')
    }
  })

  it('"Have an invite?" opens and closes an explanation of how invites work', async () => {
    const user = userEvent.setup()
    await renderLanding()
    const button = inviteButton()
    const panel = panelOf(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(isShown(panel)).toBe(false)

    await user.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(isShown(panel)).toBe(true)
    expect(panel.textContent).toMatch(/administrator/i)
    expect(panel.textContent).toMatch(/invitation only/i)
    expect(panel.textContent).toMatch(/one-time link/i)
    expect(panel.textContent).toMatch(/name and (a )?password/i)

    await user.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(isShown(panel)).toBe(false)
  })

  it('"Have an invite?" works from the keyboard', async () => {
    const user = userEvent.setup()
    await renderLanding()
    const button = inviteButton()
    button.focus()
    await user.keyboard('{Enter}')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard(' ')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('has the footer credit, the repository link and the privacy notice link', async () => {
    await renderLanding()
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain('rehrabbi')
    const hrefs = within(footer)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(REPO)
    expect(hrefs).toContain('/privacy')
  })

  it('says nothing about sign-ups, trials, customers or endorsements', async () => {
    const user = userEvent.setup()
    await renderLanding()
    // Open the invite explanation too, so its text is checked.
    await user.click(inviteButton())
    const text = document.body.textContent ?? ''
    for (const banned of [/sign[\s-]?up/i, /free trial/i, /customers/i, /trusted by/i]) {
      expect(text, String(banned)).not.toMatch(banned)
    }
  })

  it('states the security facts this deployment backs', async () => {
    await renderLanding()
    const text = screen.getByRole('main').textContent ?? ''
    for (const fact of [
      /invitation only/i,
      /bcrypt/i,
      /HttpOnly/,
      /7 days/,
      /reporter/i,
      /analyst/i,
      /admin/i,
      /hash-chained/i,
      /every 6 hours/i,
      /10 failed sign-ins/i,
      /encrypted/i,
      /90 days/,
      /GitHub/,
      /Backblaze/,
      /every Monday/i,
      /security headers/i,
    ]) {
      expect(text, String(fact)).toMatch(fact)
    }
  })

  it('under reduced motion shows the content on the first render', async () => {
    setMatchMedia('(prefers-reduced-motion: reduce)', true)
    const user = userEvent.setup()
    const h1 = await renderLanding()
    const main = screen.getByRole('main')
    const signIn = within(main).getAllByRole('link', { name: 'Sign in' })
    const headings = within(main).getAllByRole('heading', { level: 2 })
    const steps = within(main).getAllByRole('listitem')
    expectShownAtOnce(h1, inviteButton(), ...signIn, ...headings, ...steps)

    await user.click(inviteButton())
    expectShownAtOnce(panelOf(inviteButton()))
  })

  describe('with an observer that has not fired (nothing scrolled yet)', () => {
    beforeEach(() => {
      vi.stubGlobal('IntersectionObserver', SilentObserver)
    })

    it('with motion, keeps the below-the-fold blocks at their entrance state but in the accessibility tree', async () => {
      await renderLanding()
      const main = screen.getByRole('main')
      for (const block of gatedBlocks(main)) {
        expect(block.style.opacity, block.className).toBe('0')
      }
      // Hidden only visually, for the entrance: still headings and text to assistive technology.
      expect(within(main).getByRole('heading', { level: 3, name: 'Getting in' })).toBeTruthy()
      expect(within(main).getByRole('heading', { level: 3, name: 'Report it' })).toBeTruthy()
    })

    it('under reduced motion, shows them on the first render anyway', async () => {
      setMatchMedia('(prefers-reduced-motion: reduce)', true)
      await renderLanding()
      expectShownAtOnce(...gatedBlocks(screen.getByRole('main')))
    })
  })
})
