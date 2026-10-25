import * as Effect from "effect/Effect"
import type { Timer } from "@/domain/Timer"

// A system notification reaches the cook while the app is open but not in
// front. The service worker shows it where there is one: Chrome on Android
// has no `Notification` constructor. iOS only has notifications in a Home
// Screen web app.

const supported = () => typeof Notification !== "undefined"

// Browsers only ask from a user gesture, so this is called when a timer
// starts.
export const requestNotificationPermission = () => {
  if (!supported() || Notification.permission !== "default") return
  Notification.requestPermission().catch(() => {
    // ignore
  })
}

const registration = Effect.tryPromise(() =>
  "serviceWorker" in navigator
    ? navigator.serviceWorker.getRegistration()
    : Promise.resolve(undefined),
).pipe(Effect.orElseSucceed(() => undefined))

// Without a service worker (the dev server), notifications are kept here so
// they can be closed.
const pageNotifications = new Map<string, Notification>()

export const showTimerNotification = Effect.fnUntraced(function* (
  timer: Timer,
) {
  if (!supported() || Notification.permission !== "granted") return
  // In front, the toast and sound are enough
  if (document.visibilityState === "visible") return
  const tag = timer.notificationTag()
  const options: NotificationOptions = {
    body: timer.label,
    tag,
    icon: "/pwa-192x192.png",
    requireInteraction: true,
  }
  const sw = yield* registration
  if (sw) {
    yield* Effect.tryPromise(() =>
      sw.showNotification("Timer finished", options),
    ).pipe(Effect.ignore)
    return
  }
  yield* Effect.try(() => {
    const notification = new Notification("Timer finished", options)
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
    notification.onclose = () => {
      pageNotifications.delete(tag)
    }
    pageNotifications.set(tag, notification)
  }).pipe(Effect.ignore)
})

export const closeTimerNotification = Effect.fnUntraced(function* (
  timer: Timer,
) {
  if (!supported()) return
  const tag = timer.notificationTag()
  pageNotifications.get(tag)?.close()
  const sw = yield* registration
  if (!sw) return
  const notifications = yield* Effect.tryPromise(() =>
    sw.getNotifications({ tag }),
  ).pipe(Effect.orElseSucceed(() => []))
  for (const notification of notifications) {
    notification.close()
  }
})
