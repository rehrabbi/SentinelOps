// What every e2e test shares: browser pages that fail the test on a CSP violation, an uncaught
// error or an unexpected console error, and the API's own command-line tools.
import { execFileSync } from 'node:child_process'
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { API_BIN, ORIGIN, apiEnv } from './env.ts'

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

export interface Browsers {
  /** A new browser context (its own cookies) with one page, watched for problems. */
  open(storageState?: StorageState): Promise<Page>
  /**
   * Allows a 401 from this API path, which the browser logs as a console error. By default only
   * GET /api/me may answer 401: that is how a signed-out visitor is told they are signed out.
   */
  allow401(path: string): void
}

declare global {
  interface Window {
    __e2eReportCsp?: (violation: string) => void
  }
}

export const test = base.extend<{ browsers: Browsers }>({
  browsers: async ({ browser }, provide) => {
    const problems: string[] = []
    const allowed401 = new Set(['/api/me'])
    const contexts: BrowserContext[] = []

    async function open(storageState?: StorageState): Promise<Page> {
      const context = await browser.newContext({ baseURL: ORIGIN, storageState })
      contexts.push(context)

      // Chromium also logs CSP violations to the console, but the event names the directive.
      await context.exposeBinding('__e2eReportCsp', (_source, violation: string) => {
        problems.push(`CSP violation: ${violation}`)
      })
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__e2eReportCsp?.(`${e.effectiveDirective} refused ${e.blockedURI || 'inline code'}`)
        })
      })

      context.on('console', (message) => {
        if (message.type() !== 'error') return
        const source = message.location().url
        const path = source.startsWith(ORIGIN) ? new URL(source).pathname : ''
        if (/status of 401/.test(message.text()) && allowed401.has(path)) return
        problems.push(`console error: ${message.text()} (${source || 'no source'})`)
      })
      context.on('weberror', (error) => {
        problems.push(`uncaught error: ${error.error().message}`)
      })
      return context.newPage()
    }

    await provide({ open, allow401: (path) => allowed401.add(path) })

    for (const context of contexts) await context.close()
    expect(problems, 'console errors, uncaught errors or CSP violations').toEqual([])
  },
})

export { expect }

/**
 * Runs the API's command-line tool against the e2e database and returns the one-time link it
 * prints: `linkFromCli(['invite', ...])` gives http://localhost:4173/invite#<token>.
 */
export function linkFromCli(args: string[]): string {
  const output = execFileSync(API_BIN, [...args, '--site', ORIGIN], { env: apiEnv(), encoding: 'utf8' })
  const link = output.match(/^http\S+#\S+$/m)?.[0]
  if (!link) throw new Error(`No link in the output of ${args[0]}`)
  return link
}
