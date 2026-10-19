import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { QueryBuilder } from "./IndexedDb"
import { uuidBytes } from "./lib/Id"
import { tableRowHandler } from "./lib/rowHandler"
import { TimerEvent, TimerEvents } from "./Timers/Events"

const TimersHandlers = EventLog.group(TimerEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers.handle(
      TimerEvent.tag,
      tableRowHandler(db, "timers", TimerEvent, { tableKey: uuidBytes }),
    )
  }),
)

const TimersReactivity = EventLog.groupReactivity(TimerEvents, {
  [TimerEvent.tag]: ["timers"],
})

export const TimersLayer = Layer.mergeAll(
  TimersHandlers,
  TimersReactivity,
  EventRow.compaction(TimerEvents, TimerEvent),
)
