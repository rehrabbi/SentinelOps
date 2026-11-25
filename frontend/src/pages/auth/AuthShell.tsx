import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { Logo } from '../../brand/Logo'
import { Card } from '../../ui/Card'
import './AuthShell.css'

// The range rings behind the eye: the pupil's diamond, repeated outwards like a radar's rings.
const RINGS = [124, 236, 372, 540]
const diamond = (r: number) => `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`

// The quiet zone's mask is fully clear for the inner 62% of its radius and fades back to full
// strength at its edge (AuthShell.css). In the approved design the text's farthest corners sit a
// little way into that fade, where the lines are faint; 80% of the radius is the most the text may
// reach before the zone grows.
const QUIET_LIMIT = 0.8

/**
 * Fit the rings' quiet zone to the heading and subtitle as they are actually laid out, so the ring
 * lines never cross the text, whatever its wrapping: a narrow phone, a long title, or a large
 * default font size. AuthShell.css holds the approved zone for each width; this keeps its shape,
 * centres it on the text, and grows it only when some line would reach past QUIET_LIMIT, so at
 * the usual sizes it stays exactly as approved.
 * The result goes in --auth-quiet-fit-*, which the stylesheet prefers when set. Without
 * ResizeObserver the CSS values stand.
 *
 * Measuring happens only in ResizeObserver callbacks, which run after layout and before paint,
 * so reading the boxes never forces an extra layout; the custom properties it writes feed only a
 * mask, which is paint.
 */
function useQuietZone(section: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = section.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const head = root.querySelector<HTMLElement>('.auth-head')
    const eye = root.querySelector<SVGElement>('.auth-eye')
    if (!head || !eye) return

    const measure = () => {
      // The approved zone at this width, from the stylesheet.
      const css = getComputedStyle(root)
      const rx = parseFloat(css.getPropertyValue('--auth-quiet-rx'))
      const ry = parseFloat(css.getPropertyValue('--auth-quiet-ry'))
      if (!(rx > 0 && ry > 0)) return

      // Every line box of the text, relative to the section. Each element's lines are taken
      // relative to its own box and placed at its layout offset, so the settle animation's
      // transform never skews them.
      const rootBox = root.getBoundingClientRect()
      const lines: { left: number; right: number; top: number; bottom: number }[] = []
      for (const el of head.children) {
        if (!(el instanceof HTMLElement) || el.classList.contains('auth-eye')) continue
        const box = el.getBoundingClientRect()
        // offsetLeft/offsetTop are measured from the offsetParent: this relies on .auth being
        // positioned (so it is that parent) and .auth-head staying unpositioned.
        const x = rootBox.left + el.offsetLeft - box.left
        const y = rootBox.top + el.offsetTop - box.top
        const range = document.createRange()
        range.selectNodeContents(el)
        for (const r of range.getClientRects()) {
          lines.push({
            left: r.left - rootBox.left + x,
            right: r.right - rootBox.left + x,
            top: r.top - rootBox.top + y,
            bottom: r.bottom - rootBox.top + y,
          })
        }
      }
      if (lines.length === 0) return

      // Centre: the pupil horizontally (the rings' centre), the text's middle vertically.
      const eyeBox = eye.getBoundingClientRect()
      const cx = eyeBox.left - rootBox.left + eyeBox.width / 2
      const pupilY = eyeBox.top - rootBox.top + eyeBox.height / 2
      const cy = (Math.min(...lines.map((l) => l.top)) + Math.max(...lines.map((l) => l.bottom))) / 2

      // How far the farthest line corner reaches, as a share of the limit (1 = exactly on it).
      let reach = 0
      for (const l of lines) {
        for (const px of [l.left, l.right]) {
          for (const py of [l.top, l.bottom]) {
            reach = Math.max(reach, Math.hypot((px - cx) / (rx * QUIET_LIMIT), (py - cy) / (ry * QUIET_LIMIT)))
          }
        }
      }
      const grow = Math.max(1, reach)
      root.style.setProperty('--auth-quiet-fit-y', `${Math.round(cy - pupilY)}px`)
      root.style.setProperty('--auth-quiet-fit-rx', `${Math.ceil(rx * grow)}px`)
      root.style.setProperty('--auth-quiet-fit-ry', `${Math.ceil(ry * grow)}px`)
    }

    // Observing reports every element once straight away, so this also takes the first measure.
    const observer = new ResizeObserver(measure)
    observer.observe(head)
    for (const el of head.children) observer.observe(el)
    return () => observer.disconnect()
  }, [section])
}

export interface AuthShellProps {
  /** The page's level-one heading. */
  title: string
  /** One line under the heading. */
  lede?: string
  /** A line under the panel. */
  note?: ReactNode
  /**
   * The quiet variant, for pages people reach from a link to do one job (accept an invite, reset a
   * password): the eye wakes and the rings open, but no scan, ping or trace plays.
   */
  quiet?: boolean
  /** What goes in the panel. */
  children: ReactNode
}

/**
 * The page around a sign-in-style panel: the scene (rings, and for the full variant a ping and a
 * scan, all decoration), the waking eye, the heading and the panel. The panel is usable from the
 * first frame. With reduced motion the scene simply fades in (AuthShell.css).
 */
export function AuthShell({ title, lede, note, quiet = false, children }: AuthShellProps) {
  const titleId = useId()
  const sectionRef = useRef<HTMLElement>(null)
  useQuietZone(sectionRef)
  return (
    <section ref={sectionRef} className={quiet ? 'auth auth-quiet' : 'auth'} aria-labelledby={titleId}>
      <div className="auth-scene" aria-hidden="true">
        <svg className="auth-field auth-range" viewBox="-700 -700 1400 1400" focusable="false">
          {RINGS.map((r) => (
            <path key={r} d={diamond(r)} />
          ))}
        </svg>
        {/* Its own layer, so the rings' quiet zone behind the heading never hides the ping. */}
        <svg className="auth-field" viewBox="-700 -700 1400 1400" focusable="false">
          <path className="auth-ping" d={diamond(30)} />
        </svg>
        <span className="auth-beam" />
      </div>

      <div className="auth-head">
        <Logo variant="mark" size={80} animated className="auth-eye" />
        <h1 id={titleId} className="auth-title">
          {title}
        </h1>
        {lede ? <p className="auth-lede">{lede}</p> : null}
      </div>

      <Card as="div" className="auth-panel">
        {children}
      </Card>

      {note ? <p className="auth-note">{note}</p> : null}
    </section>
  )
}
