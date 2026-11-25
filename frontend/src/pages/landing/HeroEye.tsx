import { motion } from 'motion/react'
import { WAKE } from '../../brand/wake'
import { LID_LOWER, LID_UPPER, MARK_SIZE, PUPIL } from '../../brand/geometry'
import { useReducedMotion } from '../../motion/useReducedMotion'

/**
 * The hero's eye: the Facet mark drawn large, waking once on mount (the same wake as
 * `<Logo animated>`), then keeping watch with the idle scan, which plays here and nowhere else
 * (docs/brand.md, Motion). The scan is CSS (Landing.css): the pupil glides 4 units left, right
 * and back, and one diamond ping passes under the lids, on an 8 s loop. Its group wraps the
 * pupil, so it never fights Motion for the pupil's own transform.
 *
 * Decorative: the page's heading names the product. Under reduced motion the eye is drawn still
 * and the scan does not run.
 */
export function HeroEye() {
  const reduced = useReducedMotion()
  const viewBox = `0 0 ${MARK_SIZE} ${MARK_SIZE}`

  return (
    <svg
      className="landing-eye"
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* Under the lids: they cover it as it leaves the pupil. */}
      <path className="landing-eye-ping" d={PUPIL} />
      {reduced ? (
        <g>
          <path className="landing-eye-lid" d={LID_UPPER} />
          <path className="landing-eye-lid" d={LID_LOWER} />
          <path className="landing-eye-pupil" d={PUPIL} />
        </g>
      ) : (
        <motion.g initial="initial" animate="show">
          <motion.path className="landing-eye-lid" d={LID_UPPER} variants={WAKE.upperLid} />
          <motion.path className="landing-eye-lid" d={LID_LOWER} variants={WAKE.lowerLid} />
          <g className="landing-eye-glide">
            <motion.path className="landing-eye-pupil" d={PUPIL} variants={WAKE.pupil} />
          </g>
        </motion.g>
      )}
    </svg>
  )
}
