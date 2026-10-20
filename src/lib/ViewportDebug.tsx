import { useEffect, useState } from "react"

// Temporary: shows the viewport readings behind the AI chat's layout, so a
// screenshot from an affected phone captures them. Open the app with
// `?viewport-debug` to enable it, or `?viewport-debug=vk` to also have
// Chromium's VirtualKeyboard API report the keyboard while the chat is open.
const mode = new URLSearchParams(location.search).get("viewport-debug")
export const viewportDebug = mode !== null

interface VirtualKeyboard {
  overlaysContent: boolean
  readonly boundingRect: DOMRect
}
const virtualKeyboard = (
  navigator as Navigator & { readonly virtualKeyboard?: VirtualKeyboard }
).virtualKeyboard

const inset = (name: string) => {
  const probe = document.createElement("div")
  // a margin, unlike a height, keeps the negative fallback
  probe.style.cssText = `position:fixed;visibility:hidden;margin-top:env(${name}, -1px)`
  document.body.append(probe)
  const value = parseFloat(getComputedStyle(probe).marginTop)
  probe.remove()
  return value < 0 ? "n/a" : String(Math.round(value))
}

const rect = (element: Element | null | undefined) => {
  if (!element) return "-"
  const { top, bottom } = element.getBoundingClientRect()
  return `${Math.round(top)}–${Math.round(bottom)}`
}

const read = () => {
  const viewport = window.visualViewport
  const field = document.querySelector(
    'textarea[placeholder="Type your message..."]',
  )
  const chrome = navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]
  const android = navigator.userAgent.match(/Android [\d.]+/)?.[0]
  return [
    `${android ?? "?"} ${chrome ?? navigator.userAgent.slice(0, 40)}`,
    `inner ${innerWidth}×${innerHeight} dpr ${devicePixelRatio}`,
    viewport
      ? `vv h ${viewport.height.toFixed(1)} top ${viewport.offsetTop.toFixed(1)} scale ${viewport.scale.toFixed(2)}`
      : "vv n/a",
    `inset bottom ${inset("safe-area-inset-bottom")} max ${inset("safe-area-max-inset-bottom")} top ${inset("safe-area-inset-top")}`,
    `screen ${screen.width}×${screen.height} outer ${outerWidth}×${outerHeight}`,
    virtualKeyboard
      ? `vk overlays ${virtualKeyboard.overlaysContent} top ${virtualKeyboard.boundingRect.top.toFixed(1)} h ${virtualKeyboard.boundingRect.height.toFixed(1)} env h ${inset("keyboard-inset-height")}`
      : "vk n/a",
    `chat ${rect(field?.closest(".fixed"))} field ${rect(field)} focus ${document.activeElement?.tagName.toLowerCase()}`,
  ]
}

export function ViewportDebug({ open }: { readonly open: boolean }) {
  const [lines, setLines] = useState(read)
  const [top, setTop] = useState(0)
  useEffect(() => {
    if (mode !== "vk" || !open || !virtualKeyboard) return
    virtualKeyboard.overlaysContent = true
    return () => {
      virtualKeyboard.overlaysContent = false
    }
  }, [open])
  useEffect(() => {
    const timer = setInterval(() => {
      setLines(read())
      setTop(window.visualViewport?.offsetTop ?? 0)
    }, 250)
    return () => clearInterval(timer)
  }, [])
  return (
    <pre
      className="fixed inset-x-1 z-[60] pointer-events-none whitespace-pre-wrap rounded bg-black/80 p-1 font-mono text-[10px] leading-tight text-white"
      style={{ top: top + 4 }}
    >
      {lines.join("\n")}
    </pre>
  )
}
