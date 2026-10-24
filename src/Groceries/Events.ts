import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import {
  GroceryAisleOrder,
  groceryAisleOrderKey,
} from "@/domain/GroceryAisleOrder"
import { GroceryItem, normalizeIngredientName } from "@/domain/GroceryItem"
import { IngredientAisle } from "@/domain/IngredientAisle"
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

// What an item update writes, from the whole item. The list and creation
// time stay as they were, and so does whether it's checked off: only a toggle
// writes that, so an update made from an older copy can't undo a check made
// meanwhile on another device.
export const groceryItemUpdate = (item: GroceryItem) =>
  GroceryItemEvent.patch(
    { id: item.id },
    {
      name: item.name,
      quantity: item.quantity,
      aisle: item.aisle,
      recipeIds: item.recipeIds,
      updatedAt: item.updatedAt,
    },
  )

// What merging another item into this one writes: only what the merge
// changes.
export const groceryItemMerge = (item: GroceryItem) =>
  GroceryItemEvent.patch(
    { id: item.id },
    {
      quantity: item.quantity,
      recipeIds: item.recipeIds,
      updatedAt: item.updatedAt,
    },
  )

export const groceryItemCompleted = (item: GroceryItem, completed: boolean) =>
  GroceryItemEvent.patch({ id: item.id }, { completed })
