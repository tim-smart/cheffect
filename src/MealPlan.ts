import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { QueryBuilder } from "./IndexedDb"
import { uuidBytes } from "./lib/Id"
import { tableRowHandler } from "./lib/rowHandler"
import {
  MealPlanDayNoteEvent,
  MealPlanEntryEvent,
  MealPlanEvents,
} from "./MealPlan/Events"

const MealPlanHandlers = EventLog.group(MealPlanEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers
      .handle(
        MealPlanEntryEvent.tag,
        tableRowHandler(db, "mealPlan", MealPlanEntryEvent, {
          tableKey: uuidBytes,
        }),
      )
      .handle(
        MealPlanDayNoteEvent.tag,
        tableRowHandler(db, "mealPlanDayNotes", MealPlanDayNoteEvent, {
          tableKey: uuidBytes,
        }),
      )
  }),
)

const MealPlanReactivity = EventLog.groupReactivity(MealPlanEvents, {
  [MealPlanEntryEvent.tag]: ["mealPlan"],
  [MealPlanDayNoteEvent.tag]: ["mealPlanDayNotes"],
})

export const MealPlanLayer = Layer.mergeAll(
  MealPlanHandlers,
  MealPlanReactivity,
  EventRow.compaction(MealPlanEvents, MealPlanEntryEvent),
  EventRow.compaction(MealPlanEvents, MealPlanDayNoteEvent),
)
