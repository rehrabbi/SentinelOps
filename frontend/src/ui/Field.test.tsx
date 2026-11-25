import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  it('keeps a passed aria-describedby, after its own error and hint', () => {
    render(
      <>
        <p id='form-error'>Invalid email or password</p>
        <Field label='Password' hint='At least 12 characters.' error='Too short' aria-describedby='form-error' />
      </>,
    )
    const texts = describedBy(screen.getByLabelText('Password')).map((el) => el.textContent)
    expect(texts).toEqual(['Too short', 'At least 12 characters.', 'Invalid email or password'])
  })

  it('keeps a passed aria-describedby on its own when there is no error or hint', () => {
    render(
      <>
        <p id='form-error'>Invalid email or password</p>
        <Field label='Email' aria-describedby='form-error' />
      </>,
    )
    expect(describedBy(screen.getByLabelText('Email')).map((el) => el.textContent)).toEqual(['Invalid email or password'])
  })

  it('passes a merged aria-describedby to a custom control too', () => {
    render(
      <>
        <p id='elsewhere'>Saved drafts are kept for a day.</p>
        <Field label='Severity' hint='How bad is it?' aria-describedby='elsewhere'>
          {(control) => (
            <select {...control}>
              <option>low</option>
            </select>
          )}
        </Field>
      </>,
    )
    const texts = describedBy(screen.getByLabelText('Severity')).map((el) => el.textContent)
    expect(texts).toEqual(['How bad is it?', 'Saved drafts are kept for a day.'])
  })
})

// jsdom applies no media queries, so this reads the stylesheet: forced colours drop background
// images, so the drawn chevron must give way to the system's own select arrow there.
describe('Field.css', () => {
  it('hands a select back to the system arrow in forced-colours mode', () => {
    const css = readFileSync(join(import.meta.dirname, 'Field.css'), 'utf8')
    const block = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(block).toMatch(/select\.ui-field-control\s*\{[^}]*appearance:\s*auto/)
    expect(block).toMatch(/background-image:\s*none/)
  })
})
