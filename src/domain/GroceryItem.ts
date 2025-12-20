import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { Ingredient, Recipe } from "./Recipe"
import * as DateTime from "effect/DateTime"
import * as Struct from "effect/Struct"
import { UnknownToXml } from "./Xml"
import * as Csv from "@vanillaes/csv"

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
  id: Model.GeneratedByApp(
    Schema.String.annotations({
      description: "The unique identifier of the grocery item.",
    }),
  ),
  name: Schema.String.annotations({
    description:
      "The name of the grocery item. *Do not* include quantity or unit.",
  }),
  quantity: Schema.NullOr(Schema.String).annotations({
    description:
      "The quantity and optionally unit of the grocery item, e.g.  '5', 2 lbs', '1 dozen', '500 g'. Can be null if no quantity is specified.",
  }),
  aisle: Schema.NullOr(GroceryAisle).annotations({
    description: "The aisle where the grocery item can be found.",
  }),
  recipeIds: Model.fieldEvolve(
    Schema.NullOr(Schema.NonEmptyArray(Schema.String)),
    {
      select: () =>
        Schema.NullOr(Schema.parseJson(Schema.NonEmptyArray(Schema.String))),
    },
  ),
  completed: Model.BooleanFromNumber,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(Model.FieldExcept("update")),
  updatedAt: Schema.DateTimeUtcFromNumber,
}) {
  static array = Schema.Array(GroceryItem)

  static fromForm(input: Pick<GroceryItem, "name" | "quantity" | "aisle">) {
    return new GroceryItem({
      id: crypto.randomUUID(),
      name: input.name,
      quantity: input.quantity ?? null,
      aisle: input.aisle ?? null,
      recipeIds: null,
      completed: false,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }

  static fromIngredient(ingredient: Ingredient, recipe?: Recipe): GroceryItem {
    return new GroceryItem({
      id: crypto.randomUUID(),
      name: ingredient.name,
      quantity: ingredient.quantityWithUnit,
      completed: false,
      recipeIds: recipe ? [recipe.id] : null,
      aisle: null,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }

  get nameNormalized(): string {
    return this.name.trim().toLowerCase()
  }
}

export const GroceryItemAi = Schema.Struct(
  Struct.pick(GroceryItem.fields, "id", "name", "quantity", "aisle"),
).annotations({
  description: "An item to be added to the grocery list",
})

export const GroceryItemList = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      ...GroceryItemAi.fields,
      mergedIds: Schema.Array(Schema.String).annotations({
        description: "IDs of items that were merged into this one",
      }),
    }).annotations({
      description: "An item to be added to the grocery list",
    }),
  ),
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
export const encodeGroceryItemListXml = (list: Iterable<GroceryItem>) =>
  Schema.encodeSync(GroceryItemListXml)({
    groceryItems: Array.from(list, (item) => ({ groceryItem: item })),
  })

export const encodeGroceryItemListCsv = (list: Iterable<GroceryItem>) => {
  const rows: Array<Array<string>> = []
  for (const item of list) {
    rows.push([item.id, item.name, item.quantity ?? "", item.aisle ?? ""])
  }
  return Csv.stringify([["id", "name", "quantity", "aisle"], ...rows])
}
