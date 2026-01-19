import { nowAtom } from "@/atoms"
import { Timer } from "@/domain/Timer"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Atom, Result } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as Array from "effect/Array"
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

export type TimerStatus = "running" | "paused" | "completed"

export type TimerUiState = {
  timer: Timer
  status: TimerStatus
  remaining: Duration.Duration
  progress: number
  label: string
}

export const timerUiStateAtom = Atom.make((get) => {
  const now = get.get(nowAtom)
  const timers = get.get(activeTimersAtom)

  return timers.map((timer) => {
    const remaining = timer.remainingAt(now)
    const remainingMs = Math.max(0, Duration.toMillis(remaining))
    const totalMs = Math.max(1, Duration.toMillis(timer.duration))
    const progress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs))

    let status: TimerStatus = "running"
    if (timer.pausedRemaining !== null) {
      status = "paused"
    } else if (remainingMs <= 0) {
      status = "completed"
    }

    return {
      timer,
      status,
      remaining,
      progress,
      label: timer.label,
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
  durationMs: number
}>()(
  Effect.fnUntraced(function* ({ timer, durationMs }) {
    const store = yield* Store
    const duration = Duration.millis(durationMs)
    const now = DateTime.unsafeNow()
    const remaining = timer.remainingAt(now)
    const nextRemaining = Duration.sum(remaining, duration)
    const nextDuration = Duration.sum(timer.duration, duration)
    store.commit(
      events.timerUpdate(
        timer.pausedRemaining
          ? new Timer({
              ...timer,
              duration: nextDuration,
              pausedRemaining: nextRemaining,
              updatedAt: now,
            })
          : new Timer({
              ...timer,
              duration: nextDuration,
              expiresAt: DateTime.addDuration(now, nextRemaining),
              updatedAt: now,
            }),
      ),
    )
  }),
)
