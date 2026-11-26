// Addresses and settings shared by the Playwright config, the e2e Vite config, the global setup
// and the tests.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the browser opens the app: the built site, with /api on the same origin. */
export const PREVIEW_PORT = 4173
export const ORIGIN = `http://localhost:${PREVIEW_PORT}`

/** The API's own address. Its port is fixed at 8080 in backend/main.go. */
export const API_ORIGIN = 'http://127.0.0.1:8080'

/** frontend/e2e-output: the e2e build, the API's log, results and the HTML report (git-ignored). */
export const OUTPUT_DIR = fileURLToPath(new URL('../e2e-output/', import.meta.url))
export const BACKEND_DIR = fileURLToPath(new URL('../../backend/', import.meta.url))
export const API_BIN = join(BACKEND_DIR, 'bin', process.platform === 'win32' ? 'sentinelops-e2e.exe' : 'sentinelops-e2e')

/**
 * The database the e2e run owns. It is dropped and created again at the start of every run, so it
 * must be on this machine and its name must end in _e2e: never the database you develop against.
 */
export function e2eDatabaseUrl(): URL {
  const raw = process.env.E2E_DATABASE_URL
  if (!raw) {
    throw new Error(
      'E2E_DATABASE_URL is not set. Point it at a database named *_e2e on the local Postgres, e.g. ' +
        'postgres://<user>:<password>@localhost:5432/sentinelops_e2e?sslmode=disable (see CONTRIBUTING.md).',
    )
  }
  const url = new URL(raw)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`E2E_DATABASE_URL must point at localhost, not ${url.hostname}: the run drops that database.`)
  }
  if (!/^\/[a-z0-9_]+_e2e$/.test(url.pathname)) {
    throw new Error('E2E_DATABASE_URL must name a database ending in _e2e: the run drops and recreates it.')
  }
  return url
}

/** The environment the API and its command-line tools run with during e2e. */
export function apiEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl().toString(),
    // The origin the browser is on, as FRONTEND_ORIGIN is in production. Also the --site default
    // for the invite and reset-password commands.
    FRONTEND_ORIGIN: ORIGIN,
    // Plain http on localhost, as in local development. Production sets SECURE_COOKIES=true.
    SECURE_COOKIES: 'false',
  }
  // No proxy in front, as in local development: an unset PROXY_SECRET switches the check off.
  delete env.PROXY_SECRET
  delete env.PROXY_SECRET_PREVIOUS
  return env
}
