import { useId, type ReactNode } from 'react'
import { Logo } from '../../brand/Logo'
import { Card } from '../../ui/Card'
import './AuthShell.css'

// The range rings behind the eye: the pupil's diamond, repeated outwards like a radar's rings.
const RINGS = [124, 236, 372, 540]
const diamond = (r: number) => `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`

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
  return (
    <section className={quiet ? 'auth auth-quiet' : 'auth'} aria-labelledby={titleId}>
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
