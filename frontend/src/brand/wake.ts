import type { Variants } from 'motion/react'
import { EASE_OUT } from '../motion/presets'
import { LID_TRAVEL } from './geometry'

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

/** The wake's variants (states `initial` and `show`): `<Logo animated>` and the landing hero's eye. */
export const WAKE = { upperLid, lowerLid, pupil } as const
