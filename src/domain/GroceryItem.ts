import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { Ingredient } from "./Recipe"
import * as DateTime from "effect/DateTime"

export const GroceryIsle = Schema.Literal(
  "Bakery",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Produce",
  "Pantry",
  "Frozen Foods",
  "Beverages",
  "Snacks",
)
export type GroceryIsle = typeof GroceryIsle.Type

export class GroceryItem extends Model.Class<GroceryItem>("GroceryItem")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  quantity: Schema.NullOr(Schema.String),
  aisle: Schema.NullOr(GroceryIsle),
  completed: Model.BooleanFromNumber,
  createdAt: Model.DateTimeInsertFromNumber,
  updatedAt: Model.DateTimeUpdateFromNumber,
}) {
  static array = Schema.Array(GroceryItem)

  static fromIngredient(ingredient: Ingredient): GroceryItem {
    return new GroceryItem({
      id: crypto.randomUUID(),
      name: ingredient.name,
      quantity: ingredient.quantityWithUnit,
      completed: false,
      aisle: null,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }
}
