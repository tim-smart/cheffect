import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import {
  generateUuidBytes,
  UuidBytes,
  UuidFromString,
  uuidString,
} from "@/lib/Id"
import { Ingredient, Recipe, RecipeId, RecipeIdFromString } from "./Recipe"
import * as DateTime from "effect/DateTime"
import * as Struct from "effect/Struct"
import { UnknownToXml } from "./Xml"
import * as Csv from "@vanillaes/csv"

export const GroceryAisle = Schema.Literals([
  "Bakery",
  "Baking Supplies",
  "Beverages",
  "Breakfast",
  "Canned & Jar Goods",
  "Dairy & Eggs",
  "Deli",
  "Frozen Foods",
  "Herbs & Spices",
  "Household",
  "Meat & Seafood",
  "Pantry",
  "Produce",
  "Seafood",
  "Snacks",
])
export type GroceryAisle = typeof GroceryAisle.Type

// The list that holds what's already in the pantry. Ingredients named on it
// (and not checked off) are skipped when adding a recipe to the groceries.
export const PANTRY_GROCERY_LIST_NAME = "Pantry" as const

export const GroceryItemId = UuidBytes("GroceryItemId")
export type GroceryItemId = typeof GroceryItemId.Type
export const GroceryItemIdFromString = UuidFromString(GroceryItemId)

const RecipeIds = Schema.NullOr(Schema.NonEmptyArray(RecipeId))
const RecipeIdsFromString = Schema.NullOr(
  Schema.NonEmptyArray(RecipeIdFromString),
)

export class GroceryItem extends Model.Class<GroceryItem>("GroceryItem")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: GroceryItemId,
    insert: GroceryItemId,
    update: GroceryItemId,
    json: GroceryItemIdFromString,
  }),
  list: Schema.NullOr(Schema.String)
    .annotate({
      description:
        "The name of the grocery list to add this item to. Null for the default list. If it does not exist, it will be created.",
    })
    .pipe(
      Model.FieldExcept(["update", "jsonUpdate"]),
      Model.fieldEvolve({
        insert: (s) => Schema.optional(s),
      }),
    ),
  name: Schema.String,
  quantity: Schema.NullOr(Schema.String),
  aisle: Schema.NullOr(GroceryAisle),
  recipeIds: Model.Field({
    select: RecipeIds,
    insert: RecipeIds,
    update: RecipeIds,
    json: RecipeIdsFromString,
    jsonCreate: RecipeIdsFromString,
    jsonUpdate: RecipeIdsFromString,
  }),
  completed: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {
  static array = Schema.Array(GroceryItem)
  static xml = UnknownToXml.pipe(
    Schema.decodeTo(
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
      id: GroceryItemId.make(generateUuidBytes()),
      list,
      name: input.name,
      quantity: input.quantity ?? null,
      aisle: input.aisle ?? null,
      recipeIds: null,
      completed: false,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  static fromIngredient(
    list: string | null,
    ingredient: Ingredient,
    recipe?: Recipe,
  ): GroceryItem {
    return new GroceryItem({
      id: GroceryItemId.make(generateUuidBytes()),
      list,
      name: ingredient.name,
      quantity: ingredient.quantityWithUnit,
      completed: false,
      recipeIds: recipe ? [recipe.id] : null,
      aisle: null,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  static toXml(items: Iterable<GroceryItem>) {
    return Schema.encodeSync(GroceryItem.xml)(
      Array.from(items, (item) => ({ groceryItem: item })),
    )
  }

  get idString(): string {
    return uuidString(this.id)
  }

  get nameNormalized(): string {
    return normalizeIngredientName(this.name)
  }
}

// The key of the learned aisle for an ingredient. `toLowerCase` rather than a
// locale-aware fold, so every device derives the same key from the same name.
export const normalizeIngredientName = (name: string): string =>
  name.trim().toLowerCase()

export const GroceryItemAi = Schema.Struct(
  Struct.pick(GroceryItem.json.fields, ["id", "name", "quantity", "aisle"]),
).annotate({
  description: "An item to be added to the grocery list",
})

export const GroceryItemList = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      ...GroceryItemAi.fields,
      mergedIds: Schema.Array(Schema.String).annotate({
        description: "IDs of items that were merged into this one",
      }),
    }).annotate({
      description: "An item to be added to the grocery list",
    }),
  ),
})

const GroceryItemListXml = UnknownToXml.pipe(
  Schema.decodeTo(
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
    rows.push([item.idString, item.name, item.quantity ?? "", item.aisle ?? ""])
  }
  return Csv.stringify([["id", "name", "quantity", "aisle"], ...rows])
}
