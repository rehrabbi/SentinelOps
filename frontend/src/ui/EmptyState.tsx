import type { ReactNode } from 'react'
import { Logo } from '../brand/Logo'
import './EmptyState.css'

export interface EmptyStateProps {
  /** What is empty, plainly: "No incidents yet". */
  title: string
  /** Why, and how to fill it: "Report one when something goes wrong; it shows up here." */
  body: ReactNode
  /** One way forward, usually a Button or a link. */
  action?: ReactNode
  /** Heading level for the title, to fit the page outline. Defaults to 2. */
  headingLevel?: 2 | 3
}

/** Fills the place where a list would be, and says how to fill it. The eye is open: nothing to report. */
export function EmptyState({ title, body, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div className="ui-empty-state">
      <Logo variant="mark" size={28} className="ui-empty-state-mark" />
      <Heading className="ui-empty-state-title">{title}</Heading>
      <div className="ui-empty-state-body">{body}</div>
      {action ? <div className="ui-empty-state-action">{action}</div> : null}
    </div>
  )
}
