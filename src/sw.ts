/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import type { ServiceWorkerMessage } from "./services/ServiceWorkerMessages"

declare let self: ServiceWorkerGlobalScope

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// clean old assets
cleanupOutdatedCaches()

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))

self.addEventListener("message", (event) => {
  if (!event.data) return
  switch (event.data.type) {
    case "SKIP_WAITING":
      return self.skipWaiting()
  }
})

async function sendMessage(message: ServiceWorkerMessage) {
  await self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message)
    })
  })
}

registerRoute(
  "/pwa/share",
  async ({ event }) => {
    const formData: FormData = await (event as any).request.formData()
    const url = formData.get("url") || formData.get("text")
    if (typeof url === "string" && url.startsWith("http")) {
      await sendMessage({
        _tag: "ShareUrl",
        url,
      })
    }
    return new Response(null, { status: 204 })
  },
  "POST",
)
