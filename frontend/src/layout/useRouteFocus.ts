import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

const SITE = 'SentinelOps'

const TITLES: Record<string, string> = {
  '/signin': 'Sign in',
  '/invite': 'Accept your invite',
  '/reset': 'Reset your password',
  '/privacy': 'Privacy',
  '/account': 'Account',
  '/admin': 'Users',
}

/** The document title for a page: "Incidents · SentinelOps", and so on. */
export function pageTitle(pathname: string, signedIn: boolean): string {
  if (pathname === '/') return signedIn ? `Incidents · ${SITE}` : `${SITE} · Incident tracking, watched closely`
  const page = TITLES[pathname]
  return page ? `${page} · ${SITE}` : SITE
}

// How long to wait for a page's heading before settling for <main> (a lazily loaded screen
// shows a loading line first).
const HEADING_WAIT_MS = 3000

/**
 * Focus the new page's level-one heading, or its <main> if it has none, once it is on screen.
 * Gives up if the person moves focus somewhere themselves in the meantime. Returns a cancel.
 */
function focusNewPage(): { cancel: () => void; settled: () => boolean } {
  const startedOn = document.activeElement
  let observer: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let done = false

  const stop = () => {
    done = true
    observer?.disconnect()
    observer = null
    if (timer !== undefined) clearTimeout(timer)
  }

  // Someone already went somewhere else (clicked a field, pressed Tab): leave them there.
  const movedOn = () => {
    const active = document.activeElement
    return active !== startedOn && active !== null && active !== document.body && active.isConnected
  }

  const focus = (target: HTMLElement) => {
    stop()
    if (movedOn()) return
    if (target.tagName === 'H1' && !target.hasAttribute('tabindex')) {
      // Focusable from script only, and only until focus leaves it.
      target.setAttribute('tabindex', '-1')
      target.setAttribute('data-route-focus', '')
      target.addEventListener(
        'blur',
        () => {
          target.removeAttribute('tabindex')
          target.removeAttribute('data-route-focus')
        },
        { once: true },
      )
    }
    // A new page starts at its top, as it would after a full load.
    window.scrollTo(0, 0)
    target.focus({ preventScroll: true })
  }

  const tryHeading = (): boolean => {
    const heading = document.querySelector<HTMLElement>('#main h1')
    if (!heading) return false
    focus(heading)
    return true
  }

  if (!tryHeading()) {
    observer = new MutationObserver(() => {
      tryHeading()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    timer = setTimeout(() => {
      const main = document.getElementById('main')
      if (main) focus(main)
      else stop()
    }, HEADING_WAIT_MS)
  }
  return { cancel: stop, settled: () => done }
}

/**
 * Route changes, made accessible once for the whole app:
 * - every page sets the document title ("Incidents · SentinelOps");
 * - after an in-app navigation (a link, signing in or out, a session that ended), focus moves to
 *   the new page's heading, so a screen reader announces where the person now is, once, and the
 *   next Tab starts from the top of the new page. A change of shell on the same address (logging
 *   out from "/") counts too, because the control that was focused is gone.
 * The first page shown after a load is left alone: the browser's own start-of-page focus (and
 * the skip link) work as usual. Redirects on the way there (Navigate) are not pages.
 *
 * `signedIn` is null while the session is still being checked.
 */
export function useRouteFocus(signedIn: boolean | null): void {
  const { pathname } = useLocation()
  // The last page actually shown, as "path|signedIn". Null until the first one.
  const shown = useRef<string | null>(null)

  useEffect(() => {
    if (signedIn === null) return
    document.title = pageTitle(pathname, signedIn)
    // A <Navigate> renders no page; only count what the person can see.
    if (!document.getElementById('main')) return
    const key = `${pathname}|${signedIn}`
    const before = shown.current
    shown.current = key
    if (before === null || before === key) return
    const pending = focusNewPage()
    return () => {
      // Cancelled before it could focus anything (React's development double run, or another
      // navigation straight after): forget this page, so the next run still moves focus.
      if (!pending.settled()) shown.current = before
      pending.cancel()
    }
  }, [pathname, signedIn])
}
