/** A message about the form as a whole (a failed request). Announced when it appears. */
export function AuthError({ message }: { message: string }) {
  return (
    <p className="auth-error" role="alert">
      <svg className="auth-error-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1.5 15 14H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
      </svg>
      <span>{message}</span>
    </p>
  )
}
