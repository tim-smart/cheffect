import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { router } from "./Router"
import { useRxMount } from "@effect-rx/rx-react"
import { runtimeRx } from "./livestore/rx"

export default function App() {
  useRegisterSW({
    immediate: true,
  })
  useRxMount(runtimeRx)

  return <RouterProvider router={router} />
}
