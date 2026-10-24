import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import {
  GroceryAisleOrder,
  groceryAisleOrderKey,
} from "@/domain/GroceryAisleOrder"
import {
  GroceryItem,
  normalizeIngredientName,
  sameRecipeIds,
} from "@/domain/GroceryItem"
import { IngredientAisle } from "@/domain/IngredientAisle"
import { IngredientAlias, ingredientAliasKey } from "@/domain/IngredientAlias"
import { uuidKey } from "@/lib/Id"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed. `GroceryAisle` is a literal union: adding an aisle needs every
// client updated first.
//
// Writing an item never touches the aisles: the writer sets and removes the
// learned aisle itself. Clearing a list removes each item the writer saw, so
// an item added concurrently on another device survives it.
export const GroceryItemEvent = EventRow.make("GroceryItem", {
  key: uuidKey,
  schema: Schema.Struct(GroceryItem.fields),
})

// Keyed by the normalised ingredient name.
export const IngredientAisleEvent = EventRow.make("IngredientAisle", {
  key: {
    fields: ["name"],
    derive: ({ name }) => normalizeIngredientName(name),
  },
  schema: IngredientAisle,
})

// Keyed by the source and the normalised name, so a user's alias and the
// AI's for the same name are separate rows. Every client read them a release
// before any client wrote them.
export const IngredientAliasEvent = EventRow.make("IngredientAlias", {
  key: {
    fields: ["source", "name"],
    derive: ({ source, name }) => ingredientAliasKey(source, name),
  },
  schema: IngredientAlias,
})

// Keyed by the `[list, aisle]` pair, so two devices reordering the same aisle
// on the same list write the same row.
export const GroceryAisleOrderEvent = EventRow.make("GroceryAisleOrder", {
  key: {
    fields: ["list", "aisle"],
    derive: ({ list, aisle }) => groceryAisleOrderKey(list, aisle),
  },
  schema: GroceryAisleOrder,
})

export const GroceryEvents = EventGroup.empty
  .add(GroceryItemEvent)
  .add(IngredientAisleEvent)
  .add(GroceryAisleOrderEvent)
  .add(IngredientAliasEvent)

// What changing an item from `previous` writes: only the fields that differ,
// and the update time. A field the writer didn't change keeps whatever
// another device wrote to it meanwhile, so a merge that adds only recipes
// can't undo a quantity set elsewhere. Whether it's checked off is never
// written here: only a toggle writes that.
export const groceryItemChange = (previous: GroceryItem, item: GroceryItem) =>
  GroceryItemEvent.patch(
    { id: item.id },
    {
      ...(item.name !== previous.name && { name: item.name }),
      ...(item.quantity !== previous.quantity && { quantity: item.quantity }),
      ...(item.aisle !== previous.aisle && { aisle: item.aisle }),
      ...(!sameRecipeIds(item.recipeIds, previous.recipeIds) && {
        recipeIds: item.recipeIds,
      }),
      updatedAt: item.updatedAt,
    },
  )

export const groceryItemCompleted = (item: GroceryItem, completed: boolean) =>
  GroceryItemEvent.patch({ id: item.id }, { completed })
