import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getIncidents, getMe, login, logout, onSessionExpired } from './api'

// Every call goes through fetch, so a stub stands in for the API: each test says what the next
// response is, and the session-expiry handler records whether it ran.

function respond(status: number, body?: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })),
  )
}

const expired = vi.fn()

beforeEach(() => {
  expired.mockClear()
  onSessionExpired(expired)
})

afterEach(() => {
  onSessionExpired(() => {})
  vi.unstubAllGlobals()
})

describe('onSessionExpired', () => {
  it('runs its handler on a 401 from getIncidents, and the call still fails', async () => {
    respond(401)
    await expect(getIncidents()).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('does not run on a 401 from login (that is a wrong password, not an ended session)', async () => {
    respond(401)
    await expect(login('m.santos@example.com', 'wrong')).rejects.toThrow('Invalid email or password')
    expect(expired).not.toHaveBeenCalled()
  })

  it('does not run on a 401 from getMe (that only means nobody is signed in)', async () => {
    respond(401)
    await expect(getMe()).resolves.toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it('does not run on a 401 from logout (the session is already gone, as asked)', async () => {
    respond(401)
    await expect(logout()).rejects.toBeInstanceOf(ApiError)
    expect(expired).not.toHaveBeenCalled()
  })

  it('does not run on other failures, such as a 403', async () => {
    respond(403)
    await expect(getIncidents()).rejects.toBeInstanceOf(ApiError)
    expect(expired).not.toHaveBeenCalled()
  })
})
