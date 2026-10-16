import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { Recipe, RecipeEdit } from "@/domain/Recipe"

// Rows are the domain fields plus the hidden last-writer-wins stamps. The
// repo strips `_lww` when it decodes a row into the domain model.
const Lww = Schema.Record(Schema.String, Schema.String)

export const RecipeRow = Schema.Struct({ ...Recipe.fields, _lww: Lww })
export type RecipeRow = typeof RecipeRow.Type

export class RecipesTable extends IndexedDbTable.make({
  name: "recipes",
  schema: RecipeRow,
  keyPath: "id",
}) {}

// Recipe edits are keyed by recipe id, a reusable key, so a remove keeps the
// row as a tombstone (`deleted: 1`) and reads skip it.
export const RecipeEditRow = Schema.Struct({
  ...RecipeEdit.fields,
  deleted: Schema.Literals([0, 1]),
  _lww: Lww,
})
export type RecipeEditRow = typeof RecipeEditRow.Type

export class RecipeEditsTable extends IndexedDbTable.make({
  name: "recipeEdits",
  schema: RecipeEditRow,
  keyPath: "id",
}) {}
