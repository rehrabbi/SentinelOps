import { useEffect, useState, type RefObject } from 'react'

/**
 * Where the reveal triggers: any part of the element inside the viewport, less its bottom tenth.
 * A threshold of 0 means the element's height never matters: a section taller than the viewport
 * (a phone at 400% zoom, say) is revealed as soon as its top edge comes in. A ratio threshold
 * would never be reached there, and the content would stay hidden for good.
 */
export const SEEN_OPTIONS: IntersectionObserverInit = { threshold: 0, rootMargin: '0px 0px -10% 0px' }

const PRINT = 'print'

/**
 * True once the element has scrolled into view, and from then on. It is also true at once where
 * the browser has no IntersectionObserver (or the element is missing), and as soon as the page is
 * about to print, so content never waits on an observer that cannot fire and no printout has
 * blank sections.
 */
export function useSeenOnce(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (seen) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }

    const reveal = () => setSeen(true)
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reveal()
    }, SEEN_OPTIONS)
    observer.observe(el)

    // Printing: beforeprint where it exists, and the print media query as a second signal.
    window.addEventListener('beforeprint', reveal)
    const printQuery = typeof window.matchMedia === 'function' ? window.matchMedia(PRINT) : null
    const onPrint = (event: MediaQueryListEvent) => {
      if (event.matches) reveal()
    }
    printQuery?.addEventListener('change', onPrint)

    return () => {
      observer.disconnect()
      window.removeEventListener('beforeprint', reveal)
      printQuery?.removeEventListener('change', onPrint)
    }
  }, [ref, seen])

  return seen
}
