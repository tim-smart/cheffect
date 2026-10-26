import * as Schema from "effect/Schema"
import { StoredGroceryAisle } from "./GroceryItem"

// The aisle learned for an ingredient, keyed by its normalised name. Writers
// set it explicitly; adding or updating a grocery item no longer does.
export const IngredientAisle = Schema.Struct({
  name: Schema.String,
  aisle: StoredGroceryAisle,
})
export type IngredientAisle = typeof IngredientAisle.Type
