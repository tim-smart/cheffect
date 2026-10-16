import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import {
  MealPlanDayNote,
  type MealPlanDayNoteId,
} from "./domain/MealPlanDayNote"
import type { MealPlanEntryId } from "./domain/MealPlanEntry"
import { QueryBuilder } from "./IndexedDb"
import * as Compaction from "./lib/Compaction"
import { eventFields } from "./lib/eventFields"
import { uuidString } from "./lib/Id"
import { applyLww, stampAll } from "./lib/Lww"
import { MealPlanEvents } from "./MealPlan/Events"

// Handlers converge whatever order remote entries arrive in: an add
// inserts only when the row is missing, `MealPlanSetDay` and note updates
// patch under last-writer-wins and do nothing when the row is missing, and
// removes hard-delete, so a late update can't bring a row back. A day note
// add on an existing row (a re-import) merges under last-writer-wins.

const noteFields = eventFields(MealPlanDayNote.insert)

const noteUpdate = ({
  day,
  note,
  updatedAt,
}: typeof MealPlanDayNote.update.Type) => ({
  day,
  note,
  updatedAt,
})

const MealPlanHandlers = EventLog.group(MealPlanEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const entries = db.from("mealPlan")
    const notes = db.from("mealPlanDayNotes")

    const entryRow = (id: MealPlanEntryId) =>
      entries
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    const noteRow = (id: MealPlanDayNoteId) =>
      notes
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    return handlers
      .handle("MealPlanAdd", ({ payload, entry }) =>
        Effect.gen(function* () {
          if ((yield* entryRow(payload.id)) !== undefined) return
          const { id, recipeId, day } = payload
          yield* entries.insert(stampAll({ id, recipeId, day }, entry))
        }).pipe(Effect.orDie),
      )
      .handle("MealPlanSetDay", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* entryRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, { day: payload.day }, entry)
          if (next !== row) yield* entries.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MealPlanRemove", ({ payload }) =>
        entries.delete().equals(payload.id).pipe(Effect.orDie),
      )
      .handle("MealPlanDayNoteAdd", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* noteRow(payload.id)
          const fields = noteFields(payload)
          if (row === undefined) {
            yield* notes.insert(stampAll(fields, entry))
            return
          }
          const next = applyLww(row, fields, entry)
          if (next !== row) yield* notes.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MealPlanDayNoteUpdate", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* noteRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, noteUpdate(payload), entry)
          if (next !== row) yield* notes.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MealPlanDayNoteRemove", ({ payload }) =>
        notes.delete().equals(payload.id).pipe(Effect.orDie),
      )
  }),
)

const MealPlanReactivity = EventLog.groupReactivity(MealPlanEvents, {
  MealPlanAdd: ["mealPlan"],
  MealPlanSetDay: ["mealPlan"],
  MealPlanRemove: ["mealPlan"],
  MealPlanDayNoteAdd: ["mealPlanDayNotes"],
  MealPlanDayNoteUpdate: ["mealPlanDayNotes"],
  MealPlanDayNoteRemove: ["mealPlanDayNotes"],
})

const MealPlanCompaction = Compaction.layer(MealPlanEvents, {
  MealPlanAdd: () => Compaction.create("mealPlan"),
  MealPlanSetDay: ({ day }) => Compaction.patch("mealPlan", { day }),
  MealPlanRemove: ({ id }) => Compaction.remove("mealPlan", [uuidString(id)]),
  MealPlanDayNoteAdd: (payload) =>
    Compaction.set("mealPlanDayNotes", noteFields(payload)),
  MealPlanDayNoteUpdate: (payload) =>
    Compaction.patch("mealPlanDayNotes", noteUpdate(payload)),
  MealPlanDayNoteRemove: ({ id }) =>
    Compaction.remove("mealPlanDayNotes", [uuidString(id)]),
})

export const MealPlanLayer = Layer.mergeAll(
  MealPlanHandlers,
  MealPlanReactivity,
  MealPlanCompaction,
)
