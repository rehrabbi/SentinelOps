import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one main action. secondary: the alternative. ghost: quiet, in toolbars and menus. danger: destroys or revokes. */
  variant?: ButtonVariant
  /**
   * The action is in progress: shows a spinner, sets aria-busy and disables the button so it
   * cannot be sent twice. Change the label too ("Signing in…") so the state is in words.
   */
  busy?: boolean
}

/** A button from the design system. Defaults to type="button"; pass type="submit" in forms. */
export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['ui-btn', `ui-btn-${variant}`, className].filter(Boolean).join(' ')
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
}
