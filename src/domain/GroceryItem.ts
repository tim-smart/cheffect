import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { Ingredient } from "./Recipe"
import * as DateTime from "effect/DateTime"
import * as Struct from "effect/Struct"
import { UnknownToXml } from "./Xml"

export const GroceryAisle = Schema.Literal(
  "Bakery",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Produce",
  "Pantry",
  "Frozen Foods",
  "Beverages",
  "Snacks",
)
export type GroceryAisle = typeof GroceryAisle.Type

export class GroceryItem extends Model.Class<GroceryItem>("GroceryItem")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  quantity: Schema.NullOr(Schema.String),
  aisle: Schema.NullOr(GroceryAisle),
  completed: Model.BooleanFromNumber,
  createdAt: Model.DateTimeInsertFromNumber,
  updatedAt: Model.DateTimeUpdateFromNumber,
}) {
  static array = Schema.Array(GroceryItem)

  static fromForm(input: Pick<GroceryItem, "name" | "quantity" | "aisle">) {
    return new GroceryItem({
      id: crypto.randomUUID(),
      name: input.name,
      quantity: input.quantity ?? null,
      aisle: input.aisle ?? null,
      completed: false,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }

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

export const GroceryItemAi = Schema.Struct(
  Struct.pick(GroceryItem.fields, "id", "name", "quantity", "aisle"),
).annotations({
  description: "An item to be added to the grocery list",
})

export const GroceryItemList = Schema.Struct({
  items: Schema.Array(GroceryItemAi),
})

const GroceryItemListXml = UnknownToXml.pipe(
  Schema.compose(
    Schema.Struct({
      groceryItems: Schema.Array(
        Schema.Struct({
          groceryItem: GroceryItemAi,
        }),
      ),
    }),
  ),
)
export const encodeGroceryItemListXml = (list: ReadonlyArray<GroceryItem>) =>
  Schema.encodeSync(GroceryItemListXml)({
    groceryItems: list.map((item) => ({ groceryItem: item })),
  })
