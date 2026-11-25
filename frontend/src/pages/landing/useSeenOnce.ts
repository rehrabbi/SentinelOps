import { useEffect, useState, type RefObject } from 'react'

/**
 * True once the element has scrolled into view, and from then on. Where the browser has no
 * IntersectionObserver (or the element is missing) it is true at once, so content never waits on
 * an observer that cannot fire.
 */
export function useSeenOnce(ref: RefObject<Element | null>, amount = 0.2): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (seen) return
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { threshold: amount },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, amount, seen])

  return seen
}
