/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { NetworkOnly } from "workbox-strategies"

declare let self: ServiceWorkerGlobalScope

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// clean old assets
cleanupOutdatedCaches()

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))

registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkOnly())

self.addEventListener("message", (event) => {
  if (!event.data) return
  switch (event.data.type) {
    case "SKIP_WAITING":
      return self.skipWaiting()
  }
})
