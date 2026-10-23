import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { router } from "./Router"
import { useAtomMount, useAtomValue } from "@effect/atom-react"
import { aiChatOpenAtom, installPromptAtom } from "./atoms"
import { useLayoutEffect } from "react"
import { timerNotificationsAtom } from "./Timers/TimerNotifications"
import { seedDevRecipesAtom } from "@/dev/seedDevRecipes"
import { DatabaseBlockedScreen } from "@/components/DatabaseBlocked"
import { remoteAtom } from "@/EventLog"
import { JoinLinkPrompt } from "@/Sync/JoinLinkPrompt"

export default function App() {
  useAtomMount(installPromptAtom)
  useAtomMount(timerNotificationsAtom)
  useAtomMount(remoteAtom)

  useRegisterSW({
    immediate: true,
  })

  return (
    <>
      {import.meta.env.DEV && !skipDevSeed ? <DevSeedRecipesMount /> : null}
      <RouterProvider router={router} />
      <JoinLinkPrompt />
      <DatabaseBlockedScreen />
      <DisableScroll />
      <SystemTheme />
    </>
  )
}

// The seed reads every module's repo on load, so e2e tests that need a
// screen's data unloaded turn it off once the store is seeded.
const skipDevSeed =
  import.meta.env.DEV && localStorage.getItem("cheffect:skipDevSeed") === "1"

function DevSeedRecipesMount() {
  useAtomMount(seedDevRecipesAtom)
  return null
}

function isDarkMode() {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

// The page's background as sRGB hex, read from the `--background` token so
// the status bar always matches it. The token is oklch, which not every
// browser accepts in theme-color, so a canvas converts it.
function backgroundHex() {
  const context = document.createElement("canvas").getContext("2d")
  if (!context) return undefined
  context.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim()
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return `#${[red, green, blue].map((n) => n.toString(16).padStart(2, "0")).join("")}`
}

function setThemeColor(color: string) {
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement("meta")
    meta.setAttribute("name", "theme-color")
    document.head.appendChild(meta)
  }
  meta.setAttribute("content", color)
}

function SystemTheme() {
  useLayoutEffect(() => {
    const listener = () => {
      document.documentElement.classList.toggle("dark", isDarkMode())
      const color = backgroundHex()
      if (color) setThemeColor(color)
    }
    const matcher = window.matchMedia("(prefers-color-scheme: dark)")
    matcher.addEventListener("change", listener)
    listener()
    return () => matcher.removeEventListener("change", listener)
  }, [])
  return null
}

function DisableScroll() {
  const aiChatOpen = useAtomValue(aiChatOpenAtom)
  useLayoutEffect(() => {
    // iOS Safari can still scroll the page when only <body> is locked. The
    // desktop panel leaves the page scrollable, so it keeps the initial
    // `visible`: any other overflow on <html> turns the full-height <body>
    // into its own scroller, and the page jumps to the top.
    for (const element of [document.documentElement, document.body]) {
      if (aiChatOpen) {
        element.classList.add("overflow-hidden", "chat-panel:overflow-visible")
      } else {
        element.classList.remove(
          "overflow-hidden",
          "chat-panel:overflow-visible",
        )
      }
    }
  }, [aiChatOpen])
  return <div className="overflow-hidden hidden" />
}
