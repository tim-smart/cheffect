import { Atom, Registry } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { activeTimersAtom } from "./atoms"
import * as Stream from "effect/Stream"
import * as FiberMap from "effect/FiberMap"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import { Timer } from "@/domain/Timer"

export const TimerNotifications = Layer.scopedDiscard(
  Effect.gen(function* () {
    const registry = yield* Registry.AtomRegistry
    const fibers = yield* FiberMap.make<string>()

    const notify = Effect.fnUntraced(function* (timer: Timer) {
      while (true) {
        const now = yield* DateTime.now
        const remaining = timer.remainingAt(now)
        if (Duration.isZero(remaining)) break
        yield* Effect.sleep(1000)
      }

      // TODO: Send notification to user
      yield* Effect.log(`Timer "${timer.label}" has completed!`)
    })

    yield* Registry.toStream(registry, activeTimersAtom).pipe(
      Stream.runForEach(
        Effect.fnUntraced(function* (activeTimers) {
          for (const timer of activeTimers) {
            if (timer.pausedRemaining) {
              yield* FiberMap.remove(fibers, timer.id)
              continue
            }
            yield* FiberMap.run(fibers, timer.id, notify(timer), {
              onlyIfMissing: true,
            })
          }
        }),
      ),
      Effect.forkScoped,
    )
  }),
)

export const timerNotificationsAtom = Atom.runtime(TimerNotifications)
