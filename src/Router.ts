import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { Rx } from "@effect-rx/rx-react"

export const router = createRouter({
  routeTree,
  defaultPreload: "render",
  defaultPendingMinMs: 0,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export const locationRx = Rx.make((get) => {
  get.addFinalizer(
    router.subscribe("onRendered", (_) => {
      get.setSelf(_.toLocation)
    }),
  )
  return router.state.location
})
