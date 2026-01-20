# Cheffect Offline Image Cache

## Summary

Cache all image URL requests in the Cheffect PWA so previously viewed images load from cache, work offline, and persist across app restarts.

## Goals

- Cache images on first view and serve them from cache on subsequent loads.
- Support offline access for previously viewed images.
- Persist cached images across app restarts.
- Keep cached images indefinitely; allow browser eviction under storage pressure.

## Non-goals

- Prefetching large batches of images.
- Custom offline placeholders or error UI beyond default browser behavior.
- Analytics or telemetry for cache hits/misses.

## Users

- PWA users viewing recipe photos or other images from public URLs.

## Functional Requirements

1. Service worker intercepts all requests where `request.destination === "image"`.
2. Use a CacheFirst strategy:
   - Return the cached response immediately when available.
   - On a cache miss, fetch from the network and store the response.
3. Cache persists via Cache Storage across app restarts.
4. Cache must accept opaque (status 0) and 200 responses for cross-origin public images.
5. When offline and an image is missing from cache, allow the request to fail with default browser behavior.
6. No TTL or manual invalidation; images remain until user clears site data or the browser evicts them.
7. Use a versioned cache name (for example, `cheffect-images-v1`) and remove older image caches on service worker activation.

## Non-functional Requirements

- Compatible with the existing Vite PWA injectManifest setup.
- No auth headers required; treat image URLs as public.

## Technical Approach

- Update `src/sw.ts` to define a dedicated runtime cache for images.
- Use Workbox `CacheFirst` with a named cache (for example, `cheffect-images-v1`).
- Add `CacheableResponsePlugin` configured for statuses 0 and 200.
- On service worker activation, delete caches with the `cheffect-images-` prefix that do not match the current version.
- Keep existing precache and navigation routing unchanged.

## Acceptance Criteria

- After viewing an image once online, refreshing the page does not request it from the network.
- With DevTools offline, previously viewed images render after a hard reload.
- Closing and reopening the app still shows previously viewed images while offline.
- Images never viewed before behave with default browser failure while offline.
