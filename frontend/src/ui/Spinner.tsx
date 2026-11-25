import './Spinner.css'

export interface SpinnerProps {
  /**
   * What is loading, for screen readers ("Loading incidents"). Without it the spinner is
   * decorative, for use beside visible text that already says what is happening.
   */
  label?: string
  /** Diameter in pixels. Defaults to 16, the size of a line of small text. */
  size?: number
  className?: string
}

/** A small ring that turns while something loads. Takes its colour from the text around it. */
export function Spinner({ label, size = 16, className }: SpinnerProps) {
  const svg = (
    <svg
      className="spinner-ring"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <circle className="spinner-track" cx="8" cy="8" r="6.25" />
      <path className="spinner-arc" d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" />
    </svg>
  )
  const classes = className ? `spinner ${className}` : 'spinner'
  if (!label) return <span className={classes}>{svg}</span>
  return (
    <span className={classes} role="status">
      {svg}
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
