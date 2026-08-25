// api.ts - the single place that talks to the backend. Every request sends the
// session cookie (credentials: "include") and goes through one base URL, so the
// rest of the app never re-implements fetch details or forgets the cookie.

// One source of truth for where the API lives. Vite exposes env vars prefixed
// with VITE_ on import.meta.env; we fall back to the local dev server.
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

// The user shape as the API returns it (matches the Go User JSON - no password)
export type User = {
    id: string
    email: string
    fullName: string
    createdAt: string
    updatedAt: string
}

// ApiError carries the HTTP status so callers can branch (e.g. 401 vs 500).
export class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

// Shared fetch wrapper: always includes credentials (so the session cookie is
// sent AND stored), sets JSON content-type when there's a body, and returns the
// raw Response for callers to interpret.
async function request(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include', // without this the session cookie is never sent/stored
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
    })
}

// getMe returns the current user, or null when not logged in (401). Any other
// non-2xx is a genuine error worth surfacing.
export async function getMe(): Promise<User | null> {
    const res = await request('/api/me')
    if (res.status === 401) return null
    if (!res.ok) throw new ApiError(res.status, `GET /api/me failed (${res.status})`)
        return res.json()
}

// login posts credentials; returns the user on sucess, throws ApiError on 401
// (bad credentials) or any other non-2xx
export async function login(email: string, password: string): Promise<User> {
    const res = await request('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
        const msg = res.status === 401 ? 'Invalid email or password' : `Login failed (${res.status})`
            throw new ApiError(res.status, msg)
    }
    return res.json()
}

// logout deletes the current session (204). Idempotent server-side
export async function logout(): Promise<void> {
    const res = await request('/api/sessions/current', { method: 'DELETE' })
    if (!res.ok) throw new ApiError(res.status, `Logout failed (${res.status})`)
}