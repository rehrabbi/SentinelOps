import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('is a plain button (not submit) by default, primary, and clickable', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save changes</Button>)
    const button = screen.getByRole('button', { name: 'Save changes' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('btn-primary')).toBe(true)
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('takes each variant as a class', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const { unmount } = render(<Button variant={variant}>Go</Button>)
      expect(screen.getByRole('button').classList.contains(`btn-${variant}`)).toBe(true)
      unmount()
    }
  })

  it('busy sets aria-busy, disables it, and keeps its label', async () => {
    const onClick = vi.fn()
    render(
      <Button busy onClick={onClick}>
        Signing in…
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Signing in…' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button).toHaveProperty('disabled', true)
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('is not busy unless asked', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button').hasAttribute('aria-busy')).toBe(false)
  })
})
