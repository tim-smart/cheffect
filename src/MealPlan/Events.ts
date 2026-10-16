import * as Schema from "effect/Schema"
import * as Model from "effect/schema/Model"
import * as EventGroup from "effect/eventlog/EventGroup"
import { MealPlanDayNote, MealPlanDayNoteId } from "@/domain/MealPlanDayNote"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import { RecipeId } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays.
export const MealPlanEvents = EventGroup.empty
  .add({
    tag: "MealPlanAdd",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({
      id: MealPlanEntryId,
      recipeId: RecipeId,
      day: Model.Date,
    }),
  })
  .add({
    tag: "MealPlanSetDay",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: MealPlanEntryId, day: Model.Date }),
  })
  .add({
    tag: "MealPlanRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: MealPlanEntryId }),
  })
  .add({
    tag: "MealPlanDayNoteAdd",
    primaryKey: (note) => uuidString(note.id),
    payload: MealPlanDayNote.insert,
  })
  .add({
    tag: "MealPlanDayNoteUpdate",
    primaryKey: (note) => uuidString(note.id),
    payload: MealPlanDayNote.update,
  })
  .add({
    tag: "MealPlanDayNoteRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: MealPlanDayNoteId }),
  })
