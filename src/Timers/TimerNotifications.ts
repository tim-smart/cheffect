import { Atom, Registry } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { toast } from "sonner"
import { dismissTimerAtom, timerUiStateAtom } from "./atoms"
import * as FiberHandle from "effect/FiberHandle"
import { Timer } from "@/domain/Timer"
import * as Fiber from "effect/Fiber"

declare global {
  interface NotificationOptions {
    showTrigger?: NotificationTrigger
  }

  interface NotificationTrigger {}

  class TimestampTrigger implements NotificationTrigger {
    constructor(timestamp: number)
  }
}

export const TimerNotifications = Layer.scopedDiscard(
  Effect.gen(function* () {
    const registry = yield* Registry.AtomRegistry
    const notifiedRef = yield* Ref.make<Map<string, Timer>>(new Map())

    const notify = (timerId: string, label: string) =>
      Effect.sync(() => {
        let toastId: number | string | undefined
        toastId = toast(`Timer finished: ${label}`, {
          action: {
            label: "Dismiss",
            onClick: () => {
              if (toastId !== undefined) {
                toast.dismiss(toastId)
              }
              registry.set(dismissTimerAtom, timerId)
            },
          },
          onDismiss: () => {
            registry.set(dismissTimerAtom, timerId)
          },
        })
      })

    const vibrateHandle = yield* FiberHandle.make()
    const vibrate = Effect.gen(function* () {
      // play /timer.mp3 sound
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          if (typeof window === "undefined") return
          const audio = new Audio("/timer.mp3")
          audio.loop = true
          audio.play().catch(() => {
            // ignore
          })
          return audio
        }),
        (audio) =>
          Effect.sync(() => {
            if (!audio) return
            audio.pause()
            audio.currentTime = 0
          }),
      )

      while (true) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(200)
        }
        yield* Effect.sleep(1000)
      }
    }).pipe(
      Effect.scoped,
      FiberHandle.run(vibrateHandle, { onlyIfMissing: true }),
    )

    let serviceWorkerRegistration: ServiceWorkerRegistration | undefined
    const regFiber = yield* Effect.promise(() => {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        return navigator.serviceWorker.ready
      }
      return Promise.resolve<undefined>(undefined)
    }).pipe(
      Effect.tap((registration) => {
        serviceWorkerRegistration = registration
        if (registration) {
          Notification.requestPermission()
        }
      }),
      Effect.forkScoped,
    )

    const getNotifications = Effect.fnUntraced(function* (timer: Timer) {
      if (!serviceWorkerRegistration) return []
      const reg = serviceWorkerRegistration
      return yield* Effect.promise(() =>
        reg.getNotifications({
          tag: timer.notificationTag(),
          includeTriggered: true,
        } as NotificationOptions),
      )
    })

    const scheduleNotification = Effect.fnUntraced(function* (timer: Timer) {
      if (!serviceWorkerRegistration) return
      if (!("showTrigger" in Notification.prototype)) return
      const existing = yield* getNotifications(timer)
      if (existing.length > 0) return
      serviceWorkerRegistration.showNotification(`Timer finished`, {
        tag: timer.notificationTag(),
        body: timer.label,
        showTrigger: new TimestampTrigger(timer.expiresAt.epochMillis),
      })
    })

    const cancelNotification = Effect.fnUntraced(function* (timer: Timer) {
      if (!serviceWorkerRegistration) return
      const existing = yield* getNotifications(timer)
      for (const notification of existing) {
        notification.close()
      }
    })

    yield* Fiber.await(regFiber).pipe(Effect.timeoutOption("1 seconds"))

    yield* Registry.toStream(registry, timerUiStateAtom).pipe(
      Stream.runForEach(
        Effect.fnUntraced(function* (timerStates) {
          const notified = yield* Ref.get(notifiedRef)
          const nextNotified = new Map(notified)
          const activeIds = new Set(
            timerStates.map((timerState) => timerState.timer.id),
          )
          const anyCompleted = timerStates.some(
            (timerState) => timerState.status === "completed",
          )

          if (anyCompleted) {
            yield* vibrate
          } else {
            yield* FiberHandle.clear(vibrateHandle)
          }

          for (const timer of nextNotified.values()) {
            if (activeIds.has(timer.id)) continue
            nextNotified.delete(timer.id)
            yield* cancelNotification(timer)
          }

          for (const timerState of timerStates) {
            if (timerState.status === "completed") {
              if (!nextNotified.has(timerState.timer.id)) {
                nextNotified.set(timerState.timer.id, timerState.timer)
                yield* notify(timerState.timer.id, timerState.label)
              }
              continue
            }
            nextNotified.delete(timerState.timer.id)
            if (timerState.status === "running") {
              yield* scheduleNotification(timerState.timer)
            } else {
              yield* cancelNotification(timerState.timer)
            }
          }

          yield* Ref.set(notifiedRef, nextNotified)
        }),
      ),
      Effect.forkScoped,
    )
  }),
)

export const timerNotificationsAtom = Atom.runtime(TimerNotifications)
