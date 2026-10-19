import { useLayoutEffect, useState } from "react"

export interface VisualViewport {
  /** Distance from the top of the layout viewport to the visible area */
  readonly top: number
  /** Height of the visible area */
  readonly height: number
  /** Whether something, like the on-screen keyboard, covers the page */
  readonly obstructed: boolean
}

/**
 * The part of the page that is visible. iOS doesn't resize the page for the
 * keyboard: it shrinks the visual viewport and pans it down the page, so
 * fixed elements have to follow both its size and its offset.
 */
export const useVisualViewport = (): VisualViewport => {
  const [value, setValue] = useState(getVisualViewport)

  useLayoutEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      setValue((prev) => {
        const next = getVisualViewport()
        return prev.top === next.top &&
          prev.height === next.height &&
          prev.obstructed === next.obstructed
          ? prev
          : next
      })
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

const getVisualViewport = (): VisualViewport => {
  const viewport = window.visualViewport
  if (!viewport) {
    return { top: 0, height: window.innerHeight, obstructed: false }
  }
  return {
    top: Math.max(0, Math.round(viewport.offsetTop)),
    height: Math.round(viewport.height),
    obstructed: window.innerHeight - viewport.height >= 1,
  }
}
