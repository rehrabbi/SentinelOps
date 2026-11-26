// The Vite config for the end-to-end tests only. It builds the app the way production does and
// serves it the way Cloudflare Pages does: the site and its /api on one origin, with the security
// headers from public/_headers. Production itself never reads this file.
import { readFileSync } from 'node:fs'
import { defineConfig, mergeConfig } from 'vite'
import base from '../vite.config.ts'
import { API_ORIGIN, PREVIEW_PORT } from './env.ts'

// An empty API address makes the app call /api on its own site, exactly as the deploy workflow
// builds it. Set here, before the base config reads it, so the preload of /api/me is in the build.
process.env.VITE_API_URL = ''

/**
 * The headers public/_headers gives every page ("/*"), so the tests run under the production CSP.
 * Lines starting with "!" remove a header Pages would add, which a local server never adds.
 */
function productionHeaders(): Record<string, string> {
  const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
  const headers: Record<string, string> = {}
  let inAllPages = false
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#')) continue
    if (!/^\s/.test(line)) {
      inAllPages = line.trim() === '/*'
      continue
    }
    const entry = line.trim()
    if (!inAllPages || entry.startsWith('!')) continue
    const colon = entry.indexOf(':')
    headers[entry.slice(0, colon).trim()] = entry.slice(colon + 1).trim()
  }
  if (!headers['Content-Security-Policy']) throw new Error('public/_headers has no Content-Security-Policy for /*')
  return headers
}

export default defineConfig((env) =>
  mergeConfig(base(env), {
    // Its own folder, so a normal `npm run build` in dist/ is never replaced by this one.
    build: { outDir: 'e2e-output/dist', emptyOutDir: true },
    preview: {
      port: PREVIEW_PORT,
      strictPort: true,
      headers: productionHeaders(),
      // Stands in for the Pages Function: /api goes to the API on the same origin. No proxy
      // secret, as in local development, where the API runs with PROXY_SECRET unset.
      proxy: { '/api': { target: API_ORIGIN } },
    },
  }),
)
