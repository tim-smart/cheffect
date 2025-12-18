import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { GroceryAisle } from "./GroceryItem"

export class IngredientAisle extends Model.Class<IngredientAisle>(
  "IngredientAisle",
)({
  name: Schema.String,
  aisle: GroceryAisle,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(Model.FieldExcept("update")),
  updatedAt: Schema.DateTimeUtcFromNumber,
}) {
  static array = Schema.Array(IngredientAisle)
}
