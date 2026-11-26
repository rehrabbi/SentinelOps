// Runs once before the tests: a fresh database, the API built from this checkout, migrated and
// started. Returns the teardown that stops the API.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API_BIN, API_ORIGIN, BACKEND_DIR, OUTPUT_DIR, apiEnv, e2eDatabaseUrl } from './env.ts'

/**
 * Drops and recreates the e2e database. Uses psql if it is installed (CI has it), otherwise the
 * psql inside the Compose database container, so a machine with only Docker needs nothing more.
 * The password travels in PGPASSWORD, never on a command line.
 */
function resetDatabase(): void {
  const url = e2eDatabaseUrl()
  const name = url.pathname.slice(1) // checked by e2eDatabaseUrl: [a-z0-9_]+_e2e
  const sql = [`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`, `CREATE DATABASE ${name}`]
  const env = {
    ...process.env,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: 'postgres',
  }
  const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...sql.flatMap((s) => ['-c', s])]

  const local = spawnSync('psql', ['-h', url.hostname.replace(/^\[|\]$/g, ''), '-p', url.port || '5432', ...args], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (!local.error) {
    if (local.status !== 0) throw new Error(`psql could not reset ${name}`)
    return
  }
  // No psql here: use the one in the Compose container, which reaches Postgres on its own localhost.
  const docker = spawnSync(
    'docker',
    ['exec', '-e', 'PGUSER', '-e', 'PGPASSWORD', '-e', 'PGDATABASE', 'sentinelops-db', 'psql', '-h', '127.0.0.1', ...args],
    { env, stdio: ['ignore', 'inherit', 'inherit'] },
  )
  if (docker.error || docker.status !== 0) {
    throw new Error(`Could not reset ${name}: install psql, or start the Compose database (docker compose up -d).`)
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

export default async function globalSetup(): Promise<() => void> {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  // The API's port is fixed, and something already answering there would quietly take the
  // tests' requests: refuse instead of testing the wrong API.
  if (await answers(`${API_ORIGIN}/healthz`)) {
    throw new Error(
      `Something is already serving ${API_ORIGIN}. Stop it first (a local \`go run .\`, or the Compose ` +
        'API: docker compose --profile app stop api).',
    )
  }

  resetDatabase()

  // Build once, then run the binary: the server, migrate, invite and reset-password all use it.
  execFileSync('go', ['build', '-o', API_BIN, '.'], { cwd: BACKEND_DIR, stdio: 'inherit' })
  execFileSync(API_BIN, ['migrate'], { env: apiEnv(), stdio: 'inherit' })

  const logPath = join(OUTPUT_DIR, 'api.log')
  const log = openSync(logPath, 'w')
  const api = spawn(API_BIN, [], { env: apiEnv(), stdio: ['ignore', log, log] })
  closeSync(log)
  let exited = false
  api.on('exit', () => {
    exited = true
  })

  const deadline = Date.now() + 30_000
  for (;;) {
    if (exited) throw new Error(`The API exited during start-up:\n${readFileSync(logPath, 'utf8')}`)
    try {
      const res = await fetch(`${API_ORIGIN}/readyz`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) break
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      api.kill()
      throw new Error(`The API did not become ready in 30 s. Its log is in ${logPath}.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return () => {
    api.kill()
  }
}
