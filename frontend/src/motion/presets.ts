import type { Transition, Variants } from 'motion/react'

// Numbers mirror the CSS tokens (--ease-out, --ease-in-out, --dur-fast/base/slow) so CSS and
// JS motion feel like one system. Motion takes seconds; the tokens are milliseconds.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const

// Under reduced motion every preset becomes a short fade: no travel, no scale, nothing hidden.
const REDUCED: Transition = { duration: 0.12, ease: 'linear' }

export type TransitionKind = 'enter' | 'exit' | 'emphasis'
export type VariantKind = 'fadeUp' | 'scan' | 'stagger'

/** Timing for a preset: enter/exit for working UI, emphasis to draw the eye. */
export function transition(kind: TransitionKind, reduced: boolean): Transition {
  if (reduced) return REDUCED
  switch (kind) {
    // Working screens: snappy, strong ease-out (matches --dur-base).
    case 'enter':
      return { duration: 0.2, ease: EASE_OUT }
    // Leaving is quicker than arriving so the interface never makes people wait (--dur-fast).
    case 'exit':
      return { duration: 0.12, ease: EASE_OUT }
    // A brief pulse or glow to draw attention; symmetric curve so it settles back.
    case 'emphasis':
      return { duration: 0.36, ease: EASE_IN_OUT }
  }
}

/**
 * Named animation states.
 * fadeUp: default entrance for content, a short rise into place.
 * scan: the brand's radar sweep; the logo and landing hero only, never working screens.
 * stagger: put on a parent so its children (using fadeUp) arrive one after another.
 */
export function variants(kind: VariantKind, reduced: boolean): Variants {
  if (reduced) {
    // Content is visible from the start; show only changes the timing, so nothing waits on motion.
    return {
      initial: { opacity: 1 },
      show: { opacity: 1, transition: REDUCED },
    }
  }
  switch (kind) {
    case 'fadeUp':
      return {
        initial: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: transition('enter', false) },
      }
    case 'scan':
      // A sweep from the left edge: the element is revealed by a wiping clip, like a radar pass.
      return {
        initial: { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
        show: {
          opacity: 1,
          clipPath: 'inset(0 0% 0 0)',
          transition: { duration: 0.9, ease: EASE_IN_OUT },
        },
      }
    case 'stagger':
      return {
        initial: {},
        show: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
      }
  }
}
