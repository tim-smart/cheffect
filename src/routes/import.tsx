import { createRecipeAtom, extractRuntime } from "@/Recipes/atoms"
import { router } from "@/Router"
import { isAiEnabledResultAtom } from "@/services/AiHelpers"
import * as Atom from "effect/reactivity/Atom"
import { useAtomSet } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import { sharedUrl } from "@/lib/shareTarget"
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

// Launches only focus an open window (`launch_handler` is `focus-existing`),
// so opening the app keeps the page the user is on. A share made while the
// app is open still has to reach this route. The launch that opened this
// document is routed by the browser already.
const openedWith = window.location.href
let opening = true
window.launchQueue?.setConsumer(({ targetURL }) => {
  const initial = opening && targetURL === openedWith
  opening = false
  if (targetURL === undefined || initial) return
  const url = new URL(targetURL)
  if (url.origin !== window.location.origin || url.pathname !== "/import") {
    return
  }
  router.navigate({ href: url.pathname + url.search })
})

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
