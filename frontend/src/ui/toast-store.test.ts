import { afterEach, describe, expect, it } from 'vitest'
import { clearToasts, getToasts, toast } from './toast-store'

afterEach(() => clearToasts())

const messages = () => getToasts().map((t) => t.message)

describe('toast queue cap', () => {
  it('keeps three errors when a success arrives', () => {
    toast('e1', 'error')
    toast('e2', 'error')
    toast('e3', 'error')
    toast('ok', 'success')
    expect(messages()).toEqual(['e1', 'e2', 'e3'])
  })

  it('keeps an error while newer successes push each other out', () => {
    toast('e1', 'error')
    toast('s1', 'success')
    toast('s2', 'success')
    toast('s3', 'success')
    expect(messages()).toEqual(['e1', 's2', 's3'])
  })

  it('drops the oldest error only when every toast shown is an error', () => {
    toast('e1', 'error')
    toast('e2', 'error')
    toast('e3', 'error')
    toast('e4', 'error')
    expect(messages()).toEqual(['e2', 'e3', 'e4'])
  })
})
