import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import { Timer, TimerId } from "@/domain/Timer"
import { uuidString } from "@/lib/Id"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays.
export const TimerEvents = EventGroup.empty
  .add({
    tag: "TimerAdded",
    primaryKey: (timer) => uuidString(timer.id),
    payload: Timer.insert,
  })
  .add({
    tag: "TimerUpdated",
    primaryKey: (timer) => uuidString(timer.id),
    payload: Timer.update,
  })
  .add({
    tag: "TimerDeleted",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: TimerId }),
  })
