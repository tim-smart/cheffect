import { nowAtom } from "@/atoms"
import type { Timer, TimerId } from "@/domain/Timer"
import { eventLogAtom, writeEvent } from "@/EventLog"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { TimerRepo } from "./Repo"

// The repo shares the EventLog runtime's query builder and Reactivity, so
// handler writes reload its snapshot.
const timersRuntime = Atom.runtime((get) =>
  TimerRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

export const activeTimersAtom = timersRuntime
  .atom(TimerRepo.useSync((_) => _.stream).pipe(Stream.unwrap))
  .pipe(Atom.map(AsyncResult.getOrElse(Array.empty<Timer>)), Atom.keepAlive)

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

// Pause, resume and add-time compute from this device's snapshot and write
// the whole timer; the handler keeps only the running state.

export const dismissTimerAtom = timersRuntime.fn<TimerId>()((id) =>
  writeEvent({ event: "TimerDeleted", payload: { id } }),
)

export const toggleTimerAtom = timersRuntime.fn<Timer>()((timer) =>
  writeEvent({
    event: "TimerUpdated",
    payload: timer.pausedRemaining ? timer.resume() : timer.pause(),
  }),
)

export const addTimerDurationAtom = timersRuntime.fn<{
  timer: Timer
  duration: Duration.Duration
}>()(
  Effect.fnUntraced(function* ({ timer, duration }) {
    const now = yield* DateTime.now
    yield* writeEvent({
      event: "TimerUpdated",
      payload: timer.add(now, duration),
    })
  }),
)
