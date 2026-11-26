import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * When the API is this site's own /api (VITE_API_URL is empty, as in the production build), have
 * the browser ask who is signed in while the app's script is still downloading: that answer decides
 * which page to draw, so it is on the way to the first real paint. api.ts makes the same request
 * (same URL, credentials included), so the browser hands it the preloaded response. A build that
 * talks to an API elsewhere (local development, the container) gets no preload, since that request
 * would never be used.
 */
function preloadSessionCheck(apiUrl: string | undefined): Plugin {
  return {
    name: 'preload-session-check',
    apply: 'build',
    transformIndexHtml() {
      if (apiUrl !== '') return []
      return [
        {
          tag: 'link',
          attrs: { rel: 'preload', href: '/api/me', as: 'fetch', crossorigin: 'use-credentials' },
          injectTo: 'head',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), preloadSessionCheck(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL)],
  build: {
    // The CSP has no font-src, so fonts fall back to default-src 'self', which refuses data: URIs.
    // Never inline a font; everything else keeps Vite's default 4 KB limit.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
}))
