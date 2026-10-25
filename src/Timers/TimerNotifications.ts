import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { toast } from "sonner"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import { activeTimersAtom, dismissTimerAtom, timerUiStateAtom } from "./atoms"
import * as FiberHandle from "effect/FiberHandle"
import { nowAtom } from "@/atoms"
import { untilNextExpiry, type Timer, type TimerId } from "@/domain/Timer"
import {
  closeTimerNotification,
  showTimerNotification,
} from "./SystemNotifications"

export const TimerNotifications = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry
    const notifiedRef = yield* Ref.make<Map<string, Timer>>(new Map())

    const notify = (timerId: TimerId, label: string) =>
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

    // A hidden page throttles the 250ms tick, in Chrome to once a minute after
    // five minutes, so a timer could finish a minute late. A timeout set from
    // the visibility event isn't throttled as hard, and wakes the tick when
    // the next running timer finishes.
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        if (typeof document === "undefined") return
        let handle: ReturnType<typeof setTimeout> | undefined
        const wakeAtNextExpiry = () => {
          clearTimeout(handle)
          handle = undefined
          if (document.visibilityState === "visible") return
          const timers = registry.get(activeTimersAtom)
          if (!AsyncResult.isSuccess(timers)) return
          const delay = untilNextExpiry(timers.value, DateTime.nowUnsafe())
          if (delay === undefined) return
          handle = setTimeout(() => {
            registry.refresh(nowAtom)
            wakeAtNextExpiry()
          }, Duration.toMillis(delay))
        }
        document.addEventListener("visibilitychange", wakeAtNextExpiry)
        return () => {
          clearTimeout(handle)
          document.removeEventListener("visibilitychange", wakeAtNextExpiry)
        }
      }),
      (cleanup) => Effect.sync(() => cleanup?.()),
    )

    // Only a successful read says which timers exist. A failed one keeps the
    // last state, so it can't silence a ringing timer.
    yield* AtomRegistry.toStream(registry, timerUiStateAtom).pipe(
      Stream.filter(AsyncResult.isSuccess),
      Stream.map((result) => result.value),
      Stream.runForEach(
        Effect.fnUntraced(function* (timerStates) {
          const notified = yield* Ref.get(notifiedRef)
          const nextNotified = new Map(notified)
          const activeIds = new Set(
            timerStates.map((timerState) => timerState.timer.idString),
          )
          const anyCompleted = timerStates.some(
            (timerState) => timerState.status._tag === "Completed",
          )

          if (anyCompleted) {
            yield* vibrate
          } else {
            yield* FiberHandle.clear(vibrateHandle)
          }

          for (const timer of nextNotified.values()) {
            if (activeIds.has(timer.idString)) continue
            nextNotified.delete(timer.idString)
            yield* closeTimerNotification(timer)
          }

          for (const timerState of timerStates) {
            const timer = timerState.timer
            if (timerState.status._tag === "Completed") {
              if (!nextNotified.has(timer.idString)) {
                nextNotified.set(timer.idString, timer)
                yield* notify(timer.id, timer.label)
                yield* showTimerNotification(timer)
              }
              continue
            }
            if (nextNotified.delete(timer.idString)) {
              yield* closeTimerNotification(timer)
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
