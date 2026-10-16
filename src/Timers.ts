import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import type { Timer, TimerId } from "./domain/Timer"
import { QueryBuilder } from "./IndexedDb"
import * as Compaction from "./lib/Compaction"
import { eventFields } from "./lib/eventFields"
import { uuidString } from "./lib/Id"
import { applyLww, stampAll } from "./lib/Lww"
import { TimerEvents } from "./Timers/Events"

// Handlers converge whatever order remote entries arrive in: a
// create inserts only when the row is missing, an update patches the running
// state under last-writer-wins and does nothing when the row is missing, and
// a dismiss hard-deletes, so a late update can't bring the timer back.

const addedFields = eventFields(TimerEvents.events.TimerAdded.payload)

// A whole Timer can come in, createdAt included; only the running state
// changes.
const runningState = ({
  duration,
  expiresAt,
  pausedRemaining,
}: typeof Timer.update.Type) => ({
  duration,
  expiresAt,
  pausedRemaining,
})

const TimersHandlers = EventLog.group(TimerEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const timers = db.from("timers")

    const timerRow = (id: TimerId) =>
      timers
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    return handlers
      .handle("TimerAdded", ({ payload, entry }) =>
        Effect.gen(function* () {
          if ((yield* timerRow(payload.id)) !== undefined) return
          yield* timers.insert(stampAll(addedFields(payload), entry))
        }).pipe(Effect.orDie),
      )
      .handle("TimerUpdated", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* timerRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, runningState(payload), entry)
          if (next !== row) yield* timers.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("TimerDeleted", ({ payload }) =>
        timers.delete().equals(payload.id).pipe(Effect.orDie),
      )
  }),
)

const TimersReactivity = EventLog.groupReactivity(TimerEvents, {
  TimerAdded: ["timers"],
  TimerUpdated: ["timers"],
  TimerDeleted: ["timers"],
})

const TimersCompaction = Compaction.layer(TimerEvents, {
  TimerAdded: () => Compaction.create("timers"),
  TimerUpdated: (payload) => Compaction.patch("timers", runningState(payload)),
  TimerDeleted: ({ id }) => Compaction.remove("timers", [uuidString(id)]),
})

export const TimersLayer = Layer.mergeAll(
  TimersHandlers,
  TimersReactivity,
  TimersCompaction,
)
