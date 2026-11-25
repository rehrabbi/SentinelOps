import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import './Field.css'

/** What Field hands to a custom control: spread it onto the select or textarea. */
export interface FieldControlProps {
  id: string
  className: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  /** The visible label. Always shown; a placeholder is never a label. */
  label: string
  /** Help that stays under the control ("At least 12 characters."). */
  hint?: ReactNode
  /** What is wrong and how to fix it. Marks the control invalid and is read with it. */
  error?: ReactNode
  /**
   * For anything other than an <input>: a function that receives the wiring (id, class,
   * aria-invalid, aria-describedby) and returns the control, e.g.
   * `{(control) => <select {...control} value={v} onChange={…}>…</select>}`.
   * Without it, Field renders an <input> with the rest of its props.
   */
  children?: (control: FieldControlProps) => ReactNode
}

/** A labelled form control with optional hint and error, wired for screen readers. */
export function Field({ label, hint, error, children, id, className, ...inputProps }: FieldProps) {
  const autoId = useId()
  const controlId = id ?? `${autoId}-control`
  const hintId = `${autoId}-hint`
  const errorId = `${autoId}-error`
  const hasError = error !== undefined && error !== null && error !== false && error !== ''
  const hasHint = hint !== undefined && hint !== null && hint !== false && hint !== ''

  // The error is read before the hint: it is the thing to act on.
  const describedBy = [hasError ? errorId : null, hasHint ? hintId : null].filter(Boolean).join(' ')

  const control: FieldControlProps = {
    id: controlId,
    className: 'ui-field-control',
    ...(hasError ? { 'aria-invalid': true as const } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
  }

  return (
    <div className={['ui-field', hasError ? 'ui-field-invalid' : null, className].filter(Boolean).join(' ')}>
      <label className="ui-field-label" htmlFor={controlId}>
        {label}
      </label>
      {children ? children(control) : <input {...inputProps} {...control} />}
      {hasError ? (
        <p className="ui-field-error" id={errorId}>
          <svg className="ui-field-error-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 1.5 15 14H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
          </svg>
          <span>{error}</span>
        </p>
      ) : null}
      {hasHint ? (
        <p className="ui-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
