import { useLayoutEffect, useState } from "react"

export interface VisualViewport {
  /** Distance from the top of the layout viewport to the visible area */
  readonly top: number
  /** Height of the visible area */
  readonly height: number
  /** Whether something, like the on-screen keyboard, covers the page */
  readonly obstructed: boolean
  /**
   * Whether nothing of the page is visible. Safari in landscape has reported
   * a negative height when its toolbars and the keyboard cover the screen.
   * `top` and `height` keep their last visible values.
   */
  readonly collapsed: boolean
}

/**
 * The part of the page that is visible. iOS doesn't resize the page for the
 * keyboard: it shrinks the visual viewport and pans it down the page, so
 * fixed elements have to follow both its size and its offset.
 */
export const useVisualViewport = (): VisualViewport => {
  const [value, setValue] = useState(() =>
    nextVisualViewport(undefined, getVisualViewport()),
  )

  useLayoutEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      setValue((prev) => nextVisualViewport(prev, getVisualViewport()))
    }
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [])

  return value
}

const nextVisualViewport = (
  prev: VisualViewport | undefined,
  reading: Omit<VisualViewport, "collapsed">,
): VisualViewport => {
  if (!(reading.height > 0)) {
    if (prev?.collapsed) return prev
    return prev
      ? { ...prev, collapsed: true }
      : {
          top: 0,
          height: window.innerHeight,
          obstructed: false,
          collapsed: true,
        }
  }
  return prev &&
    !prev.collapsed &&
    prev.top === reading.top &&
    prev.height === reading.height &&
    prev.obstructed === reading.obstructed
    ? prev
    : { ...reading, collapsed: false }
}

const getVisualViewport = (): Omit<VisualViewport, "collapsed"> => {
  const viewport = window.visualViewport
  if (!viewport) {
    return { top: 0, height: window.innerHeight, obstructed: false }
  }
  return {
    top: Math.max(0, Math.round(viewport.offsetTop)),
    height: Math.round(viewport.height),
    // iOS 26 can shrink innerHeight to match while the keyboard is up, but
    // then it has panned the visual viewport down the page
    obstructed:
      window.innerHeight - viewport.height >= 1 || viewport.offsetTop >= 1,
  }
}
