// End-to-end tests: `npm run e2e` (see CONTRIBUTING.md). Chromium only, one worker, because the
// tests share one database and run in order.
import { defineConfig, devices } from '@playwright/test'
import { ORIGIN } from './e2e/env.ts'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-output/results',
  workers: 1,
  // The tests build on each other's data, so a retry of one alone could not pass.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { outputFolder: './e2e-output/report', open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The production build, served with /api proxied to the API the global setup starts.
  webServer: {
    command: 'npx vite build --config e2e/vite.config.ts && npx vite preview --config e2e/vite.config.ts',
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
