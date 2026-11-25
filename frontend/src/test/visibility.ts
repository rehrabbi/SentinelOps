import { expect } from 'vitest'

/** No jest-dom here, so "visible" is checked by hand: not hidden, not display:none, visibility or opacity 0. */
export function isShown(el: HTMLElement): boolean {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const css = getComputedStyle(e)
    if (e.hidden || css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0') return false
  }
  return true
}

/**
 * Fails if any of the elements is hidden on the first frame: nothing from each element up to the
 * page root has an inline opacity of 0, a transform or a clip-path (a Motion variant would set
 * these inline), and each element passes the visibility check above.
 */
export function expectShownAtOnce(...elements: HTMLElement[]) {
  for (const target of elements) {
    for (let el: HTMLElement | null = target; el; el = el.parentElement) {
      expect(el.style.opacity, `${el.tagName}.${el.className} opacity`).not.toBe('0')
      expect(el.style.transform, `${el.tagName}.${el.className} transform`).toMatch(/^(|none)$/)
      expect(el.style.clipPath, `${el.tagName}.${el.className} clip-path`).toBe('')
    }
    expect(isShown(target), `${target.tagName} is shown`).toBe(true)
  }
}
