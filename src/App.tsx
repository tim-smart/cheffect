import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { router } from "./Router"
import { useAtomMount } from "@effect-atom/atom-react"
import { Store } from "./livestore/atoms"
import { installPromptAtom } from "./atoms"

export default function App() {
  useAtomMount(Store.runtime)
  useAtomMount(installPromptAtom)

  useRegisterSW({
    immediate: true,
  })

  return <RouterProvider router={router} />
}
