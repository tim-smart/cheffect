import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { GroceryAisleOrder } from "@/domain/GroceryAisleOrder"
import { GroceryItem } from "@/domain/GroceryItem"
import { IngredientAisle } from "@/domain/IngredientAisle"

// Rows are the stored fields plus the hidden last-writer-wins stamps. Item ids
// are random, so removes hard-delete. Ingredient names and `[list, aisle]`
// pairs are reusable keys, so a remove keeps the row as a tombstone
// (`deleted: 1`) and reads skip it.
const Lww = Schema.Record(Schema.String, Schema.String)
const Deleted = Schema.Literals([0, 1])

export const GroceryItemRow = Schema.Struct({
  ...GroceryItem.fields,
  _lww: Lww,
})
export type GroceryItemRow = typeof GroceryItemRow.Type

export class GroceryItemsTable extends IndexedDbTable.make({
  name: "groceryItems",
  schema: GroceryItemRow,
  keyPath: "id",
}) {}

// Keyed by the normalised ingredient name.
export const IngredientAisleRow = Schema.Struct({
  ...IngredientAisle.fields,
  deleted: Deleted,
  _lww: Lww,
})
export type IngredientAisleRow = typeof IngredientAisleRow.Type

export class IngredientAislesTable extends IndexedDbTable.make({
  name: "ingredientAisles",
  schema: IngredientAisleRow,
  keyPath: "name",
}) {}

// Keyed by `groceryAisleOrderKey(list, aisle)`, with both kept as fields.
export const GroceryAisleOrderRow = Schema.Struct({
  id: Schema.String,
  ...GroceryAisleOrder.fields,
  deleted: Deleted,
  _lww: Lww,
})
export type GroceryAisleOrderRow = typeof GroceryAisleOrderRow.Type

export class GroceryAisleOrdersTable extends IndexedDbTable.make({
  name: "groceryAisleOrders",
  schema: GroceryAisleOrderRow,
  keyPath: "id",
}) {}
