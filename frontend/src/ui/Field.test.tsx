import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

function describedBy(el: HTMLElement): HTMLElement[] {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  return ids.map((id) => {
    const target = document.getElementById(id)
    expect(target, `aria-describedby points at a missing id "${id}"`).not.toBeNull()
    return target as HTMLElement
  })
}

describe('Field', () => {
  it('labels its input', () => {
    render(<Field label="Email" type="email" />)
    expect(screen.getByLabelText('Email').tagName).toBe('INPUT')
  })

  it('with error="Too short" marks the input invalid and describes it by the error text', () => {
    render(<Field label="Password" type="password" error="Too short" />)
    const input = screen.getByLabelText('Password')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const texts = describedBy(input).map((el) => el.textContent)
    expect(texts).toContain('Too short')
  })

  it('without an error is not invalid, and is described by its hint', () => {
    render(<Field label="Password" type="password" hint="At least 12 characters." />)
    const input = screen.getByLabelText('Password')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(describedBy(input).map((el) => el.textContent)).toEqual(['At least 12 characters.'])
  })

  it('with both, is described by the error first and then the hint', () => {
    render(<Field label="Password" hint="At least 12 characters." error="Too short" />)
    const texts = describedBy(screen.getByLabelText('Password')).map((el) => el.textContent)
    expect(texts).toEqual(['Too short', 'At least 12 characters.'])
  })

  it('with neither, has no aria-describedby at all', () => {
    render(<Field label="Full name" />)
    expect(screen.getByLabelText('Full name').hasAttribute('aria-describedby')).toBe(false)
  })

  it('wires a custom control (select, textarea) the same way', () => {
    render(
      <Field label="Severity" error="Pick one">
        {(control) => (
          <select {...control}>
            <option>low</option>
          </select>
        )}
      </Field>,
    )
    const select = screen.getByLabelText('Severity')
    expect(select.tagName).toBe('SELECT')
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(select).map((el) => el.textContent)).toEqual(['Pick one'])
  })
})
