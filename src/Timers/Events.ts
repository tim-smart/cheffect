import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import { Timer } from "@/domain/Timer"
import { uuidKey } from "@/lib/Id"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed.
export const TimerEvent = EventRow.make("Timer", {
  key: uuidKey,
  schema: Schema.Struct(Timer.fields),
})

export const TimerEvents = EventGroup.empty.add(TimerEvent)

// Pause, resume and add-time compute the whole timer from this device's
// snapshot, but write only its running state.
export const timerRunningState = (timer: Timer) =>
  TimerEvent.patch(
    { id: timer.id },
    {
      duration: timer.duration,
      expiresAt: timer.expiresAt,
      pausedRemaining: timer.pausedRemaining,
    },
  )
