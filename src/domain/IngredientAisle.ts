import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import { GroceryAisle } from "./GroceryItem"

export class IngredientAisle extends Model.Class<IngredientAisle>(
  "IngredientAisle",
)({
  name: Schema.String,
  aisle: GroceryAisle,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(Model.FieldExcept(["update"])),
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {
  static array = Schema.Array(IngredientAisle)
}
