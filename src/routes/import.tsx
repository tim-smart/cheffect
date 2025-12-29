import { createRecipeAtom } from "@/Recipes/atoms"
import { router } from "@/Router"
import { isAiEnabledResultAtom } from "@/services/AiHelpers"
import { Atom, useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import { useRef } from "react"

export const Route = createFileRoute("/import")({
  component: RouteComponent,
})

const createAndRedirect = Atom.fn<string>()(
  Effect.fnUntraced(function* (url, get) {
    const aiEnabled = yield* get.result(isAiEnabledResultAtom)
    if (!aiEnabled) {
      router.navigate({ to: "/" })
      return
    }
    yield* get.setResult(createRecipeAtom, url)
    router.navigate({ to: "/" })
  }),
)

function RouteComponent() {
  const shared = useRef<boolean>(null)
  const createRecipe = useAtomSet(createAndRedirect)

  if (!shared.current) {
    shared.current = true
    const urlParams = new URLSearchParams(window.location.search)
    const maybeUrl = urlParams.get("url")
    const text = urlParams.get("text")
    const url = maybeUrl ?? (text && text.startsWith("http") ? text : null)

    if (url) {
      createRecipe(url)
    } else {
      router.navigate({ to: "/" })
    }
  }

  return null
}
