// Cloudflare Pages Function: forwards every request under /api to the API on
// Render. The browser only ever talks to this site, so the session cookie is
// first-party and SameSite=Lax keeps working (see issue #30).

interface Env {
  API_ORIGIN: string // the API's own address, e.g. https://sentinelops-api.onrender.com
  PROXY_SECRET: string // shared with the API; stored as an encrypted Cloudflare secret
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, env.API_ORIGIN)

  // A copy of the browser's request, aimed at the API: same method, body,
  // cookies, and headers.
  const proxied = new Request(target, request)

  // These two headers are what the API trusts, so the proxy always sets them
  // itself and never passes on a value the browser supplied.
  proxied.headers.set('X-Proxy-Secret', env.PROXY_SECRET)
  const visitor = request.headers.get('CF-Connecting-IP')
  if (visitor) {
    proxied.headers.set('X-Client-IP', visitor)
  } else {
    proxied.headers.delete('X-Client-IP')
  }

  return fetch(proxied)
}
