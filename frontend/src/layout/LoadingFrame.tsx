import { LID_LOWER, LID_UPPER, MARK_SIZE, PUPIL } from '../brand/geometry'
import { Spinner } from '../ui/Spinner'
import './shell.css'

/**
 * The still eye at the centre of an otherwise empty page. index.html carries the same markup inside
 * #root, so it is on screen as soon as the stylesheet arrives, before any script runs; React then
 * renders this in its place without a visible change. (LoadingFrame.test.tsx keeps the two equal.)
 */
export function LoadingMark() {
  return (
    <svg
      className="ui-loading-mark"
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      width="48"
      height="48"
      aria-hidden="true"
      focusable="false"
    >
      <path d={LID_UPPER} />
      <path d={LID_LOWER} />
      <path className="ui-loading-pupil" d={PUPIL} />
    </svg>
  )
}

/**
 * What shows while the app asks the server whether anyone is signed in: neither shell, because
 * the answer decides which one (a signed-in person reloading should not see the public header
 * flash past). The page colour and the still mark, and a spinner if the wait gets long enough to
 * notice.
 */
export function LoadingFrame() {
  return (
    <div className="ui-shell ui-loading-frame">
      <LoadingMark />
      <Spinner label="Checking your session" className="ui-loading-spinner" />
    </div>
  )
}

/** The page area's stand-in while a screen's code loads, inside its shell. */
export function PageLoading() {
  return (
    <div className="ui-page-loading">
      <Spinner label="Loading" size={20} className="ui-loading-spinner" />
    </div>
  )
}
