import { useEffect, useState } from "react"
import { virtualKeyboard } from "./hooks"

// Temporary: shows the viewport readings behind the AI chat's layout, so a
// screenshot from an affected phone captures them. Open the app with
// `?viewport-debug` to enable it.
export const viewportDebug = new URLSearchParams(location.search).has(
  "viewport-debug",
)

// The latest keyboard, viewport and focus events, with the readings at the
// time of each
const trace: Array<string> = []
const startedAt = performance.now()
const record = (event: string) => {
  const viewport = window.visualViewport
  const keyboard = virtualKeyboard
    ? `${virtualKeyboard.overlaysContent ? "on" : "off"} ${Math.round(virtualKeyboard.boundingRect.top)}/${Math.round(virtualKeyboard.boundingRect.height)}`
    : "-"
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(2)
  trace.push(
    `${seconds} ${event} ih ${innerHeight} vv ${viewport ? Math.round(viewport.height) : "-"} kb ${keyboard}`,
  )
  if (trace.length > 16) trace.shift()
}
if (viewportDebug) {
  for (const event of ["resize", "scroll"]) {
    window.visualViewport?.addEventListener(event, () => record(`vv.${event}`))
  }
  window.addEventListener("resize", () => record("win.resize"))
  virtualKeyboard?.addEventListener("geometrychange", () => record("geometry"))
  for (const event of ["pointerdown", "focusin", "focusout"]) {
    document.addEventListener(
      event,
      (e) => record(`${event} ${(e.target as Element).tagName.toLowerCase()}`),
      true,
    )
  }
  if (virtualKeyboard) {
    const keyboard = virtualKeyboard
    const overlays = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(keyboard),
      "overlaysContent",
    )
    if (overlays?.get && overlays.set) {
      const { get, set } = overlays
      Object.defineProperty(keyboard, "overlaysContent", {
        configurable: true,
        get: () => get.call(keyboard),
        set: (value: boolean) => {
          set.call(keyboard, value)
          record(`overlay ${value ? "on" : "off"}`)
        },
      })
    }
  }
}

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
    ...trace,
  ]
}

export function ViewportDebug() {
  const [lines, setLines] = useState(read)
  const [top, setTop] = useState(0)
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
