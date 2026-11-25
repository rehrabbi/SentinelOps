import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { EASE_OUT } from '../../motion/presets'
import { formatCount } from '../format'

// The overview's two motions: numbers count to their value and bars grow from their baseline.
// Both are loud once, on load, and quick when a value changes; neither loops. They animate a
// number and a transform (scaleX/scaleY), never a width or height. Under reduced motion the
// static versions render the final value on the first frame, with no inline style at all.

/** First appearance: long enough to read as "the numbers arriving". */
const LOAD = { duration: 0.8, ease: EASE_OUT }
/** A value changed (an incident was added or moved): quick, so it never holds up work. */
const CHANGE = { duration: 0.45, ease: EASE_OUT }

export interface CountProps {
  value: number
  reduced: boolean
  /** Seconds to wait on first load, to stagger with neighbours. */
  delay?: number
}

/** A count. Counts up from 0 on load, and from the old value to the new one on change. */
export function Count({ value, reduced, delay = 0 }: CountProps) {
  return reduced ? <>{formatCount(value)}</> : <AnimatedCount value={value} delay={delay} />
}

function AnimatedCount({ value, delay }: { value: number; delay: number }) {
  const current = useMotionValue(0)
  const text = useTransform(current, (v) => formatCount(Math.round(v)))
  // True until the load animation has finished, so a change mid-load keeps the load timing.
  const first = useRef(true)

  // Layout effect, so the new target is set before the browser paints the changed frame.
  useLayoutEffect(() => {
    const timing = first.current ? { ...LOAD, delay } : CHANGE
    const controls = animate(current, value, {
      ...timing,
      onComplete: () => {
        first.current = false
      },
    })
    return () => controls.stop()
  }, [current, value, delay, first])

  return <motion.span>{text}</motion.span>
}

export interface GrowProps {
  /** The bar's final outline, drawn at its full length. */
  d: string
  /** The bar's length as a share of the scale (value / domain). Width-independent, so a resize
   *  re-draws without re-animating. */
  fraction: number
  axis: 'x' | 'y'
  reduced: boolean
  className: string
  delay?: number
}

/**
 * A bar that grows from its baseline. On change it starts from the length it had (a FLIP: the
 * outline is already the new one, and the scale starts at old/new) and eases to its new length.
 */
export function Grow({ d, fraction, axis, reduced, className, delay = 0 }: GrowProps) {
  if (reduced) return <path d={d} className={className} />
  return <AnimatedGrow d={d} fraction={fraction} axis={axis} className={className} delay={delay} />
}

function AnimatedGrow({ d, fraction, axis, className, delay }: Omit<GrowProps, 'reduced'>) {
  const scale = useMotionValue(0)
  const drawn = useRef(0)
  const first = useRef(true)

  useLayoutEffect(() => {
    // What is on screen right now, as a share of the scale, mid-animation included.
    const visible = drawn.current * scale.get()
    drawn.current = fraction
    const from = fraction > 0 ? visible / fraction : 0
    const timing = first.current ? { ...LOAD, delay } : CHANGE
    const controls = animate(scale, [from, 1], {
      ...timing,
      onComplete: () => {
        first.current = false
      },
    })
    return () => controls.stop()
  }, [scale, fraction, delay, first])

  // origin 0 / 1: grow from the left edge (bars) or the bottom edge (columns), the baseline.
  const style = axis === 'x' ? { scaleX: scale, originX: 0 } : { scaleY: scale, originY: 1 }
  return <motion.path d={d} className={className} style={style} />
}
