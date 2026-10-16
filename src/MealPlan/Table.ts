import * as Schema from "effect/Schema"
import * as Model from "effect/schema/Model"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import { RecipeId } from "@/domain/Recipe"

// Rows are the stored fields plus the hidden last-writer-wins stamps. Ids are
// random, so removes hard-delete and need no tombstone. `day` is the ISO date
// string the domain encodes.
const Lww = Schema.Record(Schema.String, Schema.String)

// An entry keeps its recipe's id; the repo joins it with the recipes snapshot.
export const MealPlanRow = Schema.Struct({
  id: MealPlanEntryId,
  recipeId: RecipeId,
  day: Model.Date,
  _lww: Lww,
})
export type MealPlanRow = typeof MealPlanRow.Type

export class MealPlanTable extends IndexedDbTable.make({
  name: "mealPlan",
  schema: MealPlanRow,
  keyPath: "id",
}) {}

export const MealPlanDayNoteRow = Schema.Struct({
  ...MealPlanDayNote.fields,
  _lww: Lww,
})
export type MealPlanDayNoteRow = typeof MealPlanDayNoteRow.Type

export class MealPlanDayNotesTable extends IndexedDbTable.make({
  name: "mealPlanDayNotes",
  schema: MealPlanDayNoteRow,
  keyPath: "id",
}) {}
