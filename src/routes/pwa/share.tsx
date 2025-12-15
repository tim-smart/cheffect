import { createRecipeAtom } from "@/Recipes/atoms"
import { router } from "@/Router"
import { isAiEnabledAtom } from "@/services/AiHelpers"
import { Atom, useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import { useRef } from "react"

export const Route = createFileRoute("/pwa/share")({
  component: RouteComponent,
})

const createAndRedirect = Atom.fn<string>()(
  Effect.fnUntraced(function* (url, get) {
    const aiEnabled = yield* get.result(isAiEnabledAtom)
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

  return (
    <div className="max-w-lg mx-auto p-2 sm:p-4 pb-30">
      <h1 className="text-lg font-semibold text-gray-900">Redirecting...</h1>
    </div>
  )
}
