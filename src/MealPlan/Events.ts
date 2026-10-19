import type * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as Model from "effect/schema/Model"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import { RecipeId } from "@/domain/Recipe"
import { uuidKey } from "@/lib/Id"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed.
//
// An entry keeps its recipe's id; the repo joins it with the recipes
// snapshot. `day` is the ISO date string the domain encodes.
export const MealPlanEntryEvent = EventRow.make("MealPlanEntry", {
  key: uuidKey,
  schema: Schema.Struct({
    id: MealPlanEntryId,
    recipeId: RecipeId,
    day: Model.Date,
  }),
})

export const MealPlanDayNoteEvent = EventRow.make("MealPlanDayNote", {
  key: uuidKey,
  schema: Schema.Struct(MealPlanDayNote.fields),
})

export const MealPlanEvents = EventGroup.empty
  .add(MealPlanEntryEvent)
  .add(MealPlanDayNoteEvent)

export const mealPlanEntryDay = (id: MealPlanEntryId, day: DateTime.Utc) =>
  MealPlanEntryEvent.patch({ id: id }, { day })

export const mealPlanDayNoteUpdate = (
  note: typeof MealPlanDayNote.update.Type,
) =>
  MealPlanDayNoteEvent.patch(
    { id: note.id },
    {
      day: note.day,
      note: note.note,
      updatedAt: note.updatedAt,
    },
  )
