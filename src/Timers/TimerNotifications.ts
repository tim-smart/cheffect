import { Atom, Registry } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { toast } from "sonner"
import { dismissTimerAtom, timerUiStateAtom } from "./atoms"
import * as FiberHandle from "effect/FiberHandle"

export const TimerNotifications = Layer.scopedDiscard(
  Effect.gen(function* () {
    const registry = yield* Registry.AtomRegistry
    const notifiedRef = yield* Ref.make<Set<string>>(new Set())

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
      while (true) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(200)
        }
        yield* Effect.sleep(1000)
      }
    }).pipe(FiberHandle.run(vibrateHandle, { onlyIfMissing: true }))

    yield* Registry.toStream(registry, timerUiStateAtom).pipe(
      Stream.runForEach(
        Effect.fnUntraced(function* (timerStates) {
          const notified = yield* Ref.get(notifiedRef)
          const nextNotified = new Set(notified)
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

          for (const id of nextNotified) {
            if (!activeIds.has(id)) {
              nextNotified.delete(id)
            }
          }

          for (const timerState of timerStates) {
            if (timerState.status === "completed") {
              if (!nextNotified.has(timerState.timer.id)) {
                nextNotified.add(timerState.timer.id)
                yield* notify(timerState.timer.id, timerState.label)
              }
            } else {
              nextNotified.delete(timerState.timer.id)
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
