import { createRecipeAtom, extractRuntime } from "@/Recipes/atoms"
import { router } from "@/Router"
import { isAiEnabledResultAtom } from "@/services/AiHelpers"
import * as Atom from "effect/reactivity/Atom"
import { useAtomSet } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { useEffect, useRef } from "react"

export const Route = createFileRoute("/import")({
  component: RouteComponent,
})

const createAndRedirect = Atom.fn<string>()(
  Effect.fnUntraced(function* (url, get) {
    const aiEnabled = yield* get.result(isAiEnabledResultAtom)
    if (!aiEnabled) {
      router.navigate({ to: "/", replace: true })
      return
    }
    yield* get.result(extractRuntime)
    // Like the URL dialog, enqueue without subscribing to the write atom.
    // Its idle TTL keeps the write alive after this route unmounts.
    get.set(createRecipeAtom, url)
    router.navigate({ to: "/", replace: true })
  }),
)

const sharedUrl = (params: URLSearchParams): string | undefined => {
  // Android apps often put the URL after a title or message in `text`.
  for (const key of ["url", "text", "title"]) {
    const match = params.get(key)?.match(/https?:\/\/[^\s<>"']+/i)?.[0]
    if (match === undefined) continue
    const url = Schema.decodeOption(Schema.URLFromString)(match)
    if (Option.isSome(url)) return url.value.href
  }
}

function RouteComponent() {
  const shared = useRef(false)
  const createRecipe = useAtomSet(createAndRedirect)

  useEffect(() => {
    if (shared.current) return
    shared.current = true
    const url = sharedUrl(new URLSearchParams(window.location.search))

    if (url) {
      createRecipe(url)
    } else {
      router.navigate({ to: "/", replace: true })
    }
  }, [createRecipe])

  return null
}
