import { nowAtom } from "@/atoms"
import { Timer } from "@/domain/Timer"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Atom, Result } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"

export const activeTimers$ = queryDb({
  query: sql`select * from timers order by createdAt asc`,
  schema: Timer.array,
})

export const activeTimersAtom = Store.makeQuery(activeTimers$).pipe(
  Atom.map(Result.getOrElse(Array.empty<Timer>)),
)

export type TimerStatus = Data.TaggedEnum<{
  Running: {
    remaining: Duration.Duration
  }
  Paused: {
    remaining: Duration.Duration
  }
  Completed: {}
}>
export const TimerStatus = Data.taggedEnum<TimerStatus>()

export interface TimerUiState {
  timer: Timer
  status: TimerStatus
  progress: number
}

export const timerUiStateAtom = Atom.make((get) => {
  const now = get.get(nowAtom)
  const timers = get.get(activeTimersAtom)

  return timers.map((timer) => {
    const remaining = timer.remainingAt(now)
    const remainingMs = Duration.toMillis(remaining)
    const totalMs = Math.max(1, Duration.toMillis(timer.duration))
    const progress =
      remainingMs === 0
        ? 1
        : Math.min(1, Math.max(0, 1 - remainingMs / totalMs))
    const status =
      remainingMs <= 0
        ? TimerStatus.Completed()
        : timer.pausedRemaining !== null
          ? TimerStatus.Paused({ remaining })
          : TimerStatus.Running({ remaining })

    return {
      timer,
      status,
      remaining,
      progress,
    }
  })
})

export const dismissTimerAtom = Store.runtime.fn<string>()(
  Effect.fnUntraced(function* (timerId) {
    const store = yield* Store
    store.commit(events.timerDeleted({ id: timerId }))
  }),
)

export const toggleTimerAtom = Store.runtime.fn<Timer>()(
  Effect.fnUntraced(function* (timer) {
    const store = yield* Store
    store.commit(
      events.timerUpdate(
        timer.pausedRemaining ? timer.resume() : timer.pause(),
      ),
    )
  }),
)

export const addTimerDurationAtom = Store.runtime.fn<{
  timer: Timer
  duration: Duration.Duration
}>()(
  Effect.fnUntraced(function* ({ timer, duration }) {
    const store = yield* Store
    const now = yield* DateTime.now
    store.commit(events.timerUpdate(timer.add(now, duration)))
  }),
)
