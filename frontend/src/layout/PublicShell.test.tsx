import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { PublicShell } from './PublicShell'

it('has a skip link, a home link named by the logo, main content, the credit and the toaster', () => {
  render(
    <MemoryRouter>
      <PublicShell>
        <h1>Sign in</h1>
      </PublicShell>
    </MemoryRouter>,
  )
  expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('#main')
  expect(screen.getByRole('link', { name: 'SentinelOps home' }).getAttribute('href')).toBe('/')
  expect(screen.getByRole('main').id).toBe('main')
  expect(screen.getByRole('contentinfo').textContent).toContain('rehrabbi')
  expect(screen.getByRole('group', { name: 'Colour theme' })).toBeTruthy()
  expect(screen.getAllByRole('status')).toHaveLength(1)
})
