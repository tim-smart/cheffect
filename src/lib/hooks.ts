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

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean
  readonly boundingRect: DOMRect
}

/**
 * Chromium's VirtualKeyboard API. With `overlaysContent` set, the keyboard
 * covers the page without resizing it and reports where it is. On an Android
 * phone, Chrome drawing under the gesture bar reported a visual viewport that
 * ran 24px behind the keyboard, while this reported the keyboard's real top.
 */
export const virtualKeyboard = (
  navigator as Navigator & { readonly virtualKeyboard?: VirtualKeyboard }
).virtualKeyboard

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
    virtualKeyboard?.addEventListener("geometrychange", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      virtualKeyboard?.removeEventListener("geometrychange", update)
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

// On an Android phone, Chrome 155 draws the page under the gesture bar. The
// first keyboard moved the page above the bar, shrinking it by the bar's
// height, but a keyboard raised again left the page under the bar while still
// measuring itself without it, so the keyboard reached that much higher than
// its rect said. Remember the page's height with the keyboard down, and how
// far a keyboard shrank it, for each page width.
let keyboardDown = { width: 0, height: 0 }
let keyboardShrink = { width: 0, height: 0 }

const keyboardBottom = (): number => {
  const { innerWidth: width, innerHeight: height } = window
  const shrink = keyboardDown.width === width ? keyboardDown.height - height : 0
  if (shrink > 0) {
    keyboardShrink = { width, height: shrink }
    return height
  }
  return keyboardShrink.width === width
    ? height - keyboardShrink.height
    : height
}

const getVisualViewport = (): Omit<VisualViewport, "collapsed"> => {
  const viewport = window.visualViewport
  if (!viewport) {
    return { top: 0, height: window.innerHeight, obstructed: false }
  }
  const top = Math.max(0, Math.round(viewport.offsetTop))
  // Chrome 124 reported the right height with a wrong top, so measure from
  // the bottom of the page
  const keyboard = virtualKeyboard?.overlaysContent
    ? virtualKeyboard.boundingRect.height
    : 0
  if (keyboard > 0) {
    return {
      top,
      height: Math.round(keyboardBottom() - keyboard) - top,
      obstructed: true,
    }
  }
  keyboardDown = { width: window.innerWidth, height: window.innerHeight }
  return {
    top,
    height: Math.round(viewport.height),
    // iOS 26 can shrink innerHeight to match while the keyboard is up, but
    // then it has panned the visual viewport down the page
    obstructed:
      window.innerHeight - viewport.height >= 1 || viewport.offsetTop >= 1,
  }
}
