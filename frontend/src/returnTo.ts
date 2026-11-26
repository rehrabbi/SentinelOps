// Where to send someone after they sign in again because their session ended mid-use.
// The place travels in the router's location state (history.state): it dies with the tab and is
// never written to localStorage, which the privacy notice promises holds only the theme.

// Pages a person never needs to be "returned" to: the public ones, and the one-time-link ones,
// whose address carries a token or whose point is to be left behind. "/" is the default landing
// route anyway.
const NOT_RETURNABLE = new Set(['/', '/signin', '/invite', '/reset', '/privacy'])

/**
 * The value if it is a same-app path we are willing to return to, otherwise null. Accepts only a
 * string that starts with one "/" (not "//", and not "/\", which browsers read as "//"), has no
 * control characters, and is not one of the public or token routes. The hash is never kept.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value) || value.includes('#')) return null
  const pathname = value.split('?')[0].replace(/\/+$/, '') || '/'
  if (NOT_RETURNABLE.has(pathname)) return null
  return value
}

/** The router state the expiry handler attaches to the redirect to /signin. */
export function returnState(location: { pathname: string; search: string }): { from: string } | null {
  const from = safeReturnPath(location.pathname + location.search)
  return from ? { from } : null
}

/** Reads the remembered place back out of a location's state, validating it again. */
export function returnPathFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null
  return safeReturnPath((state as { from: unknown }).from)
}
