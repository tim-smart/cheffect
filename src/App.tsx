import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { router } from "./Router"
import { useAtomMount, useAtomValue } from "@effect-atom/atom-react"
import { Store } from "./livestore/atoms"
import { aiChatOpenAtom, installPromptAtom } from "./atoms"
import { useLayoutEffect } from "react"

export default function App() {
  useAtomMount(Store.runtime)
  useAtomMount(installPromptAtom)

  useRegisterSW({
    immediate: true,
  })

  return (
    <>
      <RouterProvider router={router} />
      <DisableScroll />
      <SystemTheme />
    </>
  )
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
    if (aiChatOpen) {
      document.body.classList.add("overflow-hidden", "md:overflow-auto")
    } else {
      document.body.classList.remove("overflow-hidden", "md:overflow-auto")
    }
  }, [aiChatOpen])
  return <div className="overflow-hidden hidden" />
}
