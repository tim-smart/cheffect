import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import * as Atom from "effect/reactivity/Atom"

export const router = createRouter({
  routeTree,
  defaultPreload: "render",
  defaultPendingMinMs: 0,
  scrollRestoration: true,
  defaultPendingComponent: () => null,
})

// TanStack resets the window scroll in a layout effect a commit after the new
// route renders, so the browser first paints the new page at the old page's
// offset, with its sticky header over the app bar. Reset it in the commit
// that mounts the route instead, by the same rules: only for a new history
// entry, and not when the navigation targets a hash or opts out with
// `resetScroll: false`. Back and forward stay with TanStack's restoration.
let newHistoryEntry = false
router.history.subscribe(({ action }) => {
  newHistoryEntry = action.type === "PUSH" || action.type === "REPLACE"
})
router.subscribe("onBeforeRouteMount", ({ toLocation }) => {
  if (!newHistoryEntry) return
  newHistoryEntry = false
  if (!router._scroll.n || toLocation.hash) return
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: router.options.scrollRestorationBehavior,
  })
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export const locationAtom = Atom.make((get) => {
  get.addFinalizer(
    router.subscribe("onRendered", (_) => {
      get.setSelf(_.toLocation)
    }),
  )
  return router.state.location
})
