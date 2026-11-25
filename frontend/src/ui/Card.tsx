import type { HTMLAttributes, ReactNode } from 'react'
import './Card.css'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** article for something that stands alone (an incident), section for a titled part of a page. */
  as?: 'article' | 'section' | 'div'
  children: ReactNode
}

/** A raised surface for one thing: an incident, a form, a panel of settings. Never nest cards. */
export function Card({ as: Tag = 'article', className, children, ...rest }: CardProps) {
  return (
    <Tag {...rest} className={className ? `ui-card ${className}` : 'ui-card'}>
      {children}
    </Tag>
  )
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Pick the level that fits the page outline; the look stays the same. */
  as?: 'h2' | 'h3' | 'h4'
  children: ReactNode
}

/** The card's title. Long titles (and unbroken strings such as URLs) wrap instead of overflowing. */
export function CardTitle({ as: Tag = 'h3', className, children, ...rest }: CardTitleProps) {
  return (
    <Tag {...rest} className={className ? `ui-card-title ${className}` : 'ui-card-title'}>
      {children}
    </Tag>
  )
}
