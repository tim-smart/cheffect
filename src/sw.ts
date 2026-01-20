/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { CacheableResponsePlugin } from "workbox-cacheable-response"
import { CacheFirst } from "workbox-strategies"

declare let self: ServiceWorkerGlobalScope

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

const imageCachePrefix = "cheffect-images-"
const imageCacheName = `${imageCachePrefix}v1`

// cache external images
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: imageCacheName,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
)

// clean old assets
cleanupOutdatedCaches()

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(imageCachePrefix) &&
                cacheName !== imageCacheName,
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
  )
})

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))

self.addEventListener("message", (event) => {
  if (!event.data) return
  switch (event.data.type) {
    case "SKIP_WAITING":
      return self.skipWaiting()
  }
})
