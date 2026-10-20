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

function SystemTheme() {
  useLayoutEffect(() => {
    const listener = () => {
      if (isDarkMode()) {
        document.documentElement.classList.add("dark")
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", "#0a0a0a")
      } else {
        document.documentElement.classList.remove("dark")
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", "#ffffff")
      }
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
