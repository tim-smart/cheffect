import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { Atom } from "@effect-atom/atom-react"

export const router = createRouter({
  routeTree,
  defaultPreload: "render",
  defaultPendingMinMs: 0,
  scrollRestoration: true,
  defaultPendingComponent: () => null,
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
