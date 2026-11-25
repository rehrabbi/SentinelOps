import { useLayoutEffect, useRef, useState } from 'react'

// Shapes and sizing shared by the overview's charts. Charts are drawn in real pixels (the SVG's
// viewBox matches its measured width), so the 4 px rounded data end stays 4 px at any width
// instead of being stretched by a scaled viewBox.

/** Rounded data end, at most this many pixels. */
const END_RADIUS = 4

/** A horizontal bar from x = 0: square at the baseline, rounded at the data end. */
export function barPath(length: number, y: number, thickness: number): string {
  if (!(length > 0)) return ''
  const r = Math.min(END_RADIUS, length / 2, thickness / 2)
  const end = length
  return [
    `M0 ${y}`,
    `H${end - r}`,
    `A${r} ${r} 0 0 1 ${end} ${y + r}`,
    `V${y + thickness - r}`,
    `A${r} ${r} 0 0 1 ${end - r} ${y + thickness}`,
    `H0`,
    'Z',
  ].join(' ')
}

/** A column standing on `baseline`: square at the bottom, rounded at the top. */
export function columnPath(x: number, width: number, baseline: number, height: number): string {
  if (!(height > 0) || !(width > 0)) return ''
  const r = Math.min(END_RADIUS, width / 3, height)
  const top = baseline - height
  return [
    `M${x} ${baseline}`,
    `V${top + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${top}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ')
}

/**
 * The rendered width of an element in whole pixels, kept up to date as it resizes. Starts at
 * `fallback` (also used where layout is unavailable, as in tests). Measured in a layout effect, so
 * the first painted frame already has the real width.
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
