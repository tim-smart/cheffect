import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { Ingredient, Recipe } from "./Recipe"
import * as DateTime from "effect/DateTime"
import * as Struct from "effect/Struct"
import { UnknownToXml } from "./Xml"
import * as Csv from "@vanillaes/csv"

export const GroceryAisle = Schema.Literal(
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Canned & Jar Goods",
  "Herbs & Spices",
  "Baking Supplies",
  "Pantry",
  "Frozen Foods",
  "Bakery",
  "Breakfast",
  "Household",
  "Beverages",
  "Snacks",
)
export type GroceryAisle = typeof GroceryAisle.Type

export class GroceryItem extends Model.Class<GroceryItem>("GroceryItem")({
  id: Model.GeneratedByApp(Schema.String),
  list: Schema.NullOr(Schema.String)
    .annotations({
      description:
        "The name of the grocery list to add this item to. Null for the default list. If it does not exist, it will be created.",
    })
    .pipe(
      Model.FieldExcept("update", "jsonUpdate"),
      Model.fieldEvolve({
        insert: (s) => Schema.optional(s),
      }),
    ),
  name: Schema.String,
  quantity: Schema.NullOr(Schema.String),
  aisle: Schema.NullOr(GroceryAisle),
  recipeIds: Model.fieldEvolve(
    Schema.NullOr(Schema.NonEmptyArray(Schema.String)),
    {
      select: () =>
        Schema.NullOr(Schema.parseJson(Schema.NonEmptyArray(Schema.String))),
    },
  ),
  completed: Model.BooleanFromNumber,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldExcept("update", "jsonCreate", "jsonUpdate"),
  ),
  updatedAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldExcept("jsonCreate", "jsonUpdate"),
  ),
}) {
  static array = Schema.Array(GroceryItem)
  static xml = UnknownToXml.pipe(
    Schema.compose(
      Schema.Array(
        Schema.Struct({
          groceryItem: GroceryItem.json,
        }),
      ),
    ),
  )

  static fromForm(
    input: Pick<GroceryItem, "name" | "quantity" | "aisle">,
    list: string | null,
  ) {
    return new GroceryItem({
      id: crypto.randomUUID(),
      list,
      name: input.name,
      quantity: input.quantity ?? null,
      aisle: input.aisle ?? null,
      recipeIds: null,
      completed: false,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }

  static fromIngredient(
    list: string | null,
    ingredient: Ingredient,
    recipe?: Recipe,
  ): GroceryItem {
    return new GroceryItem({
      id: crypto.randomUUID(),
      list,
      name: ingredient.name,
      quantity: ingredient.quantityWithUnit,
      completed: false,
      recipeIds: recipe ? [recipe.id] : null,
      aisle: null,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }

  static toXml(items: Iterable<GroceryItem>) {
    return Schema.encodeSync(GroceryItem.xml)(
      Array.from(items, (item) => ({ groceryItem: item })),
    )
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
