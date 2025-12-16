import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { router } from "./Router"
import { useAtomMount } from "@effect-atom/atom-react"
import { Store } from "./livestore/atoms"

export default function App() {
  useAtomMount(Store.runtime)

  useRegisterSW({
    immediate: true,
  })

  return <RouterProvider router={router} />
}
