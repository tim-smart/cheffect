import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { router } from "./Router"
import { useAtomMount } from "@effect-atom/atom-react"
import { Store } from "./livestore/atoms"
import { createRecipeFromShareUrl } from "./Recipes/atoms"

export default function App() {
  useAtomMount(Store.runtime)
  useAtomMount(createRecipeFromShareUrl)

  useRegisterSW({
    immediate: true,
  })

  return <RouterProvider router={router} />
}
