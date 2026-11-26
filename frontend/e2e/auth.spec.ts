// Sign-in and password reset, end to end: a real browser, the production build served the way
// Pages serves it (same origin, production headers), the real API and a real database.
//
// The tests run in order and build on each other, as a person would: the invite creates the
// account the sign-in test uses, whose session the reset test then ends.
import type { BrowserContext, Page } from '@playwright/test'
import { ORIGIN } from './env.ts'
import { expect, linkFromCli, test } from './fixtures.ts'

test.describe.configure({ mode: 'serial' })

const EMAIL = 'e2e-admin@example.test'
const NAME = 'E2E Admin'
// Plain fixture words: this database exists only for the run.
const FIRST_PASSWORD = 'e2e-fixture-password-one'
const WRONG_PASSWORD = 'e2e-fixture-password-wrong'
const NEW_PASSWORD = 'e2e-fixture-password-two'

// The signed-in browser state each test hands to the next.
let signedIn: Awaited<ReturnType<BrowserContext['storageState']>> | undefined

async function expectIncidentsScreen(page: Page): Promise<void> {
  await expect(page).toHaveURL(`${ORIGIN}/`)
  await expect(page.getByRole('heading', { level: 1, name: 'Incidents' })).toBeVisible()
  await expect(page).toHaveTitle('Incidents · SentinelOps')
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('an invite link creates the first admin and signs them in', async ({ browsers }) => {
  const link = linkFromCli(['invite', '--email', EMAIL, '--role', 'admin'])
  const page = await browsers.open()

  const response = await page.goto(link)
  // The page is served with the production CSP, so the CSP checks in fixtures.ts mean something.
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'")

  await expect(page.getByRole('heading', { level: 1, name: 'Accept your invite' })).toBeVisible()
  // The token is read, then wiped from the address bar so it stays out of history.
  await expect(page).toHaveURL(`${ORIGIN}/invite`)
  expect(await page.evaluate(() => window.location.hash)).toBe('')

  await page.getByLabel('Full name').fill(NAME)
  await page.getByLabel('Password', { exact: true }).fill(FIRST_PASSWORD)
  await page.getByLabel('Confirm password').fill(FIRST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expectIncidentsScreen(page)
  await expect(page.getByRole('button', { name: `${NAME} (account menu)` })).toBeVisible()
  signedIn = await page.context().storageState()
})

test('signing out, a wrong password, then the right one', async ({ browsers }) => {
  const page = await browsers.open(signedIn)
  await page.goto('/')
  await expectIncidentsScreen(page)

  await page.getByRole('button', { name: `${NAME} (account menu)` }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
  // Signed out, on the landing page.
  await expect(page).toHaveURL(`${ORIGIN}/`)
  await expect(page.getByRole('heading', { level: 1, name: 'Incident tracking, watched closely.' })).toBeVisible()
  await expect(page).toHaveTitle('SentinelOps · Incident tracking, watched closely')

  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/signin`)

  // A wrong password: POST /api/sessions answers 401, which the browser logs.
  browsers.allow401('/api/sessions')
  await signIn(page, WRONG_PASSWORD)
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  const password = page.getByLabel('Password')
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(password).toHaveAccessibleDescription('Invalid email or password')
  await expect(password).toBeFocused()

  await password.fill(FIRST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expectIncidentsScreen(page)
  // After an in-app navigation, focus moves to the new page's heading.
  await expect(page.getByRole('heading', { level: 1, name: 'Incidents' })).toBeFocused()
  signedIn = await page.context().storageState()
})

test('a reset link sets a new password and ends every other session', async ({ browsers }) => {
  // A browser that stays signed in throughout, as on another device.
  const other = await browsers.open(signedIn)
  await other.goto('/')
  await expectIncidentsScreen(other)

  const link = linkFromCli(['reset-password', '--email', EMAIL])
  const page = await browsers.open()
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
  await expect(page).toHaveURL(`${ORIGIN}/reset`)
  expect(await page.evaluate(() => window.location.hash)).toBe('')

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Set new password' }).click()
  const done = page.getByRole('group', { name: 'Password reset' })
  await expect(done).toBeFocused()
  await expect(done).toContainText('every session of your account was logged out')

  // The other browser's session is gone: its next request answers 401 and the app sends it to
  // sign in, saying why.
  browsers.allow401('/api/users')
  await other.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click()
  await expect(other).toHaveURL(`${ORIGIN}/signin`)
  await expect(other.getByRole('alert')).toHaveText('Your session ended. Sign in again.')

  // The new password works, here and in the other browser alike.
  await signIn(other, NEW_PASSWORD)
  await expectIncidentsScreen(other)

  await page.getByRole('link', { name: 'Sign in with your new password' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/signin`)
  browsers.allow401('/api/sessions')
  await signIn(page, FIRST_PASSWORD)
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expectIncidentsScreen(page)
})
