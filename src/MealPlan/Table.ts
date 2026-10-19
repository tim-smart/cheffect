import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { MealPlanDayNoteEvent, MealPlanEntryEvent } from "./Events"

// Rows are stored as their events write them. Ids are random, so removes
// hard-delete.
export const MealPlanRow = MealPlanEntryEvent.schema
export type MealPlanRow = typeof MealPlanRow.Type

export class MealPlanTable extends IndexedDbTable.make({
  name: "mealPlan",
  schema: MealPlanRow,
  keyPath: "id",
}) {}

export const MealPlanDayNoteRow = MealPlanDayNoteEvent.schema
export type MealPlanDayNoteRow = typeof MealPlanDayNoteRow.Type

export class MealPlanDayNotesTable extends IndexedDbTable.make({
  name: "mealPlanDayNotes",
  schema: MealPlanDayNoteRow,
  keyPath: "id",
}) {}
