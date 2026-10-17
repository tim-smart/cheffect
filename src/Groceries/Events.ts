import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import {
  groceryAisleOrderKey,
  GroceryAisleOrder,
} from "@/domain/GroceryAisleOrder"
import {
  GroceryAisle,
  GroceryItem,
  GroceryItemId,
  normalizeIngredientName,
} from "@/domain/GroceryItem"
import { IngredientAisle } from "@/domain/IngredientAisle"
import { uuidString } from "@/lib/Id"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays. Adding or updating an item no longer writes aisles:
// the writer emits `IngredientAisleSet` and `IngredientAisleRemoved` itself,
// so `GroceryItemUpdated` drops `previousName` and `userInitiated`.
// `v1.GroceryItemCleared` and `v1.GroceryItemClearedCompleted` are dropped
// for `GroceryItemsDeleted`, which carries the ids the writer saw.
// `GroceryItemsAdded`, `GroceryItemsUpdated` and `IngredientAislesChanged`
// carry many rows as one entry, so a writer changing a lot at once (adding a
// recipe, beautifying the list) makes one journal write and one transaction
// rather than one per row.
export const GroceryEvents = EventGroup.empty
  .add({
    tag: "GroceryItemAdded",
    primaryKey: (item) => uuidString(item.id),
    payload: GroceryItem.insert,
  })
  .add({
    tag: "GroceryItemsAdded",
    // A fixed key, as for `GroceryItemsDeleted`.
    primaryKey: () => "groceryItems",
    payload: Schema.Struct({
      items: Schema.NonEmptyArray(GroceryItem.insert),
    }),
  })
  .add({
    tag: "GroceryItemUpdated",
    primaryKey: (item) => uuidString(item.id),
    payload: GroceryItem.update,
  })
  .add({
    tag: "GroceryItemsUpdated",
    primaryKey: () => "groceryItems",
    payload: Schema.Struct({
      items: Schema.NonEmptyArray(GroceryItem.update),
    }),
  })
  .add({
    tag: "GroceryItemToggled",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: GroceryItemId, completed: Schema.Boolean }),
  })
  .add({
    tag: "GroceryItemDeleted",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: GroceryItemId }),
  })
  .add({
    tag: "GroceryItemsDeleted",
    // A fixed key: the payload has no list, and clears never need to be told
    // apart from each other.
    primaryKey: () => "groceryItems",
    payload: Schema.Struct({ ids: Schema.NonEmptyArray(GroceryItemId) }),
  })
  .add({
    tag: "IngredientAisleSet",
    primaryKey: ({ name }) => normalizeIngredientName(name),
    payload: IngredientAisle,
  })
  .add({
    tag: "IngredientAisleRemoved",
    primaryKey: ({ name }) => normalizeIngredientName(name),
    payload: Schema.Struct({ name: Schema.String }),
  })
  .add({
    tag: "IngredientAislesChanged",
    primaryKey: () => "ingredientAisles",
    // A null aisle removes the name's aisle. Each name appears once.
    payload: Schema.Struct({
      aisles: Schema.NonEmptyArray(
        Schema.Struct({
          name: Schema.String,
          aisle: Schema.NullOr(GroceryAisle),
        }),
      ),
    }),
  })
  .add({
    tag: "GroceryAisleOrderSet",
    primaryKey: ({ list, aisle }) => groceryAisleOrderKey(list, aisle),
    payload: GroceryAisleOrder,
  })
