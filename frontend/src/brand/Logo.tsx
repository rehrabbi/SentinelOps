import { useId } from 'react'
import { motion, type Variants } from 'motion/react'
import { EASE_OUT } from '../motion/presets'
import { useReducedMotion } from '../motion/useReducedMotion'
import {
  LID_LOWER,
  LID_TRAVEL,
  LID_UPPER,
  LOCKUP_MARK,
  LOCKUP_TEXT_X,
  LOCKUP_VIEWBOX,
  MARK_SIZE,
  PUPIL,
  TITTLE,
  WORDMARK_VIEWBOX,
} from './geometry'
import { WORDMARK_PATH } from './wordmark-path'
import './Logo.css'

export type LogoVariant = 'mark' | 'wordmark' | 'lockup'

export interface LogoProps {
  variant: LogoVariant
  /** Height in pixels; the width follows the logo's proportions. */
  size?: number
  /** Play the wake once on mount (the lids part, then the pupil turns in). Still under reduced motion. */
  animated?: boolean
  /** Accessible name. Without it the logo is decorative and hidden from assistive technology. */
  title?: string
  className?: string
}

const VIEWBOX: Record<LogoVariant, readonly [number, number, number, number]> = {
  mark: [0, 0, MARK_SIZE, MARK_SIZE],
  wordmark: WORDMARK_VIEWBOX,
  lockup: LOCKUP_VIEWBOX,
}

const DEFAULT_SIZE: Record<LogoVariant, number> = { mark: 32, wordmark: 24, lockup: 32 }

// Wake: the eye starts shut (each lid slid LID_TRAVEL towards the middle, so only the empty
// diamond socket shows), the lids part, then the pupil turns in from a quarter turn and grows.
// Transform and opacity only.
const upperLid: Variants = {
  initial: { y: LID_TRAVEL },
  show: { y: 0, transition: { duration: 0.56, delay: 0.2, ease: EASE_OUT } },
}
const lowerLid: Variants = {
  initial: { y: -LID_TRAVEL },
  show: { y: 0, transition: { duration: 0.56, delay: 0.2, ease: EASE_OUT } },
}
const pupil: Variants = {
  initial: { opacity: 0, rotate: -90, scale: 0.5 },
  show: { opacity: 1, rotate: 0, scale: 1, transition: { duration: 0.42, delay: 0.42, ease: EASE_OUT } },
}

function Eye({ wake }: { wake: boolean }) {
  if (!wake) {
    return (
      <g>
        <path className="logo-lid" d={LID_UPPER} />
        <path className="logo-lid" d={LID_LOWER} />
        <path className="logo-pupil" d={PUPIL} />
      </g>
    )
  }
  return (
    <motion.g initial="initial" animate="show">
      <motion.path className="logo-lid" d={LID_UPPER} variants={upperLid} />
      <motion.path className="logo-lid" d={LID_LOWER} variants={lowerLid} />
      <motion.path className="logo-pupil" d={PUPIL} variants={pupil} />
    </motion.g>
  )
}

function Wordmark() {
  return (
    <g>
      <path className="logo-letters" d={WORDMARK_PATH} />
      <path className="logo-tittle" d={TITTLE} />
    </g>
  )
}

/** The SentinelOps logo as inline SVG: the Facet mark, the wordmark, or both side by side. */
export function Logo({ variant, size, animated = false, title, className }: LogoProps) {
  const reduced = useReducedMotion()
  const titleId = useId()
  const wake = animated && !reduced
  const [, , vw, vh] = VIEWBOX[variant]
  const height = size ?? DEFAULT_SIZE[variant]
  const width = Math.round(((height * vw) / vh) * 100) / 100

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX[variant].join(' ')}
      width={width}
      height={height}
      className={className ? `logo ${className}` : 'logo'}
      {...(title ? { role: 'img', 'aria-labelledby': titleId } : { 'aria-hidden': true })}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {variant === 'mark' ? <Eye wake={wake} /> : null}
      {variant === 'wordmark' ? <Wordmark /> : null}
      {variant === 'lockup' ? (
        <>
          <g transform={`translate(${LOCKUP_MARK.x} ${LOCKUP_MARK.y}) scale(${LOCKUP_MARK.scale})`}>
            <Eye wake={wake} />
          </g>
          <g transform={`translate(${LOCKUP_TEXT_X} 0)`}>
            <Wordmark />
          </g>
        </>
      ) : null}
    </svg>
  )
}
