import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { GroceryAisleOrder } from "@/domain/GroceryAisleOrder"
import { IngredientAisle } from "@/domain/IngredientAisle"
import { GroceryItemEvent } from "./Events"

// Rows are stored as their events write them, under the row's key.
export const GroceryItemRow = GroceryItemEvent.schema
export type GroceryItemRow = typeof GroceryItemRow.Type

export class GroceryItemsTable extends IndexedDbTable.make({
  name: "groceryItems",
  schema: GroceryItemRow,
  keyPath: "id",
}) {}

// Keyed by the normalised ingredient name, which `name` holds.
export const IngredientAisleRow = IngredientAisle
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
})
export type GroceryAisleOrderRow = typeof GroceryAisleOrderRow.Type

export class GroceryAisleOrdersTable extends IndexedDbTable.make({
  name: "groceryAisleOrders",
  schema: GroceryAisleOrderRow,
  keyPath: "id",
}) {}
