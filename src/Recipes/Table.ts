import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { RecipeEditEvent, RecipeEvent } from "./Events"

// Rows are stored as their events write them.
export const RecipeRow = RecipeEvent.schema
export type RecipeRow = typeof RecipeRow.Type

export class RecipesTable extends IndexedDbTable.make({
  name: "recipes",
  schema: RecipeRow,
  keyPath: "id",
}) {}

// Keyed by recipe id.
export const RecipeEditRow = RecipeEditEvent.schema
export type RecipeEditRow = typeof RecipeEditRow.Type

export class RecipeEditsTable extends IndexedDbTable.make({
  name: "recipeEdits",
  schema: RecipeEditRow,
  keyPath: "id",
}) {}
