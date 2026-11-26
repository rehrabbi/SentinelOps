import { describe, expect, it } from 'vitest'
import { returnPathFrom, returnState, safeReturnPath } from './returnTo'

describe('safeReturnPath', () => {
  it('accepts same-app paths, search included', () => {
    expect(safeReturnPath('/admin')).toBe('/admin')
    expect(safeReturnPath('/account?tab=password')).toBe('/account?tab=password')
  })

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'admin', '', '/a\nb', '/admin#token'])(
    'rejects %j',
    (value) => expect(safeReturnPath(value)).toBeNull(),
  )

  it.each(['/', '/signin', '/signin/', '/invite', '/reset?token=word', '/privacy'])(
    'rejects the public or token route %j',
    (value) => expect(safeReturnPath(value)).toBeNull(),
  )

  it('rejects anything that is not a string', () => {
    expect(safeReturnPath(undefined)).toBeNull()
    expect(safeReturnPath({ pathname: '/admin' })).toBeNull()
  })
})

describe('returnState and returnPathFrom', () => {
  it('round-trips pathname plus search and drops the rest', () => {
    expect(returnState({ pathname: '/admin', search: '?a=1' })).toEqual({ from: '/admin?a=1' })
    expect(returnPathFrom({ from: '/admin?a=1' })).toBe('/admin?a=1')
  })

  it('remembers nothing for a public route, and reads nothing from odd state', () => {
    expect(returnState({ pathname: '/privacy', search: '' })).toBeNull()
    expect(returnPathFrom(null)).toBeNull()
    expect(returnPathFrom({ from: '//evil.example' })).toBeNull()
  })
})
