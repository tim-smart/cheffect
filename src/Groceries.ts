import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import {
  type GroceryAisleOrder,
  groceryAisleOrderKey,
} from "./domain/GroceryAisleOrder"
import {
  GroceryItem,
  type GroceryItemId,
  normalizeIngredientName,
} from "./domain/GroceryItem"
import type { IngredientAisle } from "./domain/IngredientAisle"
import { GroceryEvents } from "./Groceries/Events"
import { QueryBuilder } from "./IndexedDb"
import * as Compaction from "./lib/Compaction"
import { eventFields } from "./lib/eventFields"
import { uuidString } from "./lib/Id"
import { applyLww, lwwRemove, lwwSet, stampAll } from "./lib/Lww"

// Handlers converge whatever order remote entries arrive in: an add
// inserts only when the item is missing, updates and toggles patch under
// last-writer-wins and do nothing when the item is missing, and a delete
// hard-deletes, so a late update can't bring an item back. A clear deletes
// only the ids its writer saw, so an item added concurrently survives it.
//
// Ingredient aisles and aisle orders have reusable keys, so a set upserts
// under last-writer-wins and a remove leaves a tombstone that only a newer set
// revives. Adding or updating an item never touches the aisles: the writer
// emits `IngredientAisleSet` and `IngredientAisleRemoved` itself.

const itemFields = eventFields(GroceryItem.insert)

const itemUpdate = ({
  name,
  quantity,
  aisle,
  recipeIds,
  completed,
  updatedAt,
}: typeof GroceryItem.update.Type) => ({
  name,
  quantity,
  aisle,
  recipeIds,
  completed,
  updatedAt,
})

const aisleFields = ({ name, aisle }: typeof IngredientAisle.Type) => ({
  name: normalizeIngredientName(name),
  aisle,
})

const aisleOrderFields = (order: typeof GroceryAisleOrder.Type) => ({
  id: groceryAisleOrderKey(order.list, order.aisle),
  list: order.list,
  aisle: order.aisle,
  sortOrder: order.sortOrder,
  updatedAt: order.updatedAt,
})

const GroceryHandlers = EventLog.group(GroceryEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const items = db.from("groceryItems")
    const aisles = db.from("ingredientAisles")
    const aisleOrders = db.from("groceryAisleOrders")

    const itemRow = (id: GroceryItemId) =>
      items
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    const aisleRow = (name: string) =>
      aisles
        .select()
        .equals(name)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    const aisleOrderRow = (id: string) =>
      aisleOrders
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    return handlers
      .handle("GroceryItemAdded", ({ payload, entry }) =>
        Effect.gen(function* () {
          if ((yield* itemRow(payload.id)) !== undefined) return
          const fields = itemFields(payload)
          yield* items.insert(
            stampAll({ ...fields, list: fields.list ?? null }, entry),
          )
        }).pipe(Effect.orDie),
      )
      .handle("GroceryItemUpdated", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* itemRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, itemUpdate(payload), entry)
          if (next !== row) yield* items.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("GroceryItemToggled", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* itemRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, { completed: payload.completed }, entry)
          if (next !== row) yield* items.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("GroceryItemDeleted", ({ payload }) =>
        items.delete().equals(payload.id).pipe(Effect.orDie),
      )
      .handle("GroceryItemsDeleted", ({ payload }) =>
        Effect.forEach(payload.ids, (id) => items.delete().equals(id), {
          discard: true,
        }).pipe(
          db.withTransaction({ tables: ["groceryItems"], mode: "readwrite" }),
          Effect.orDie,
        ),
      )
      .handle("IngredientAisleSet", ({ payload, entry }) =>
        Effect.gen(function* () {
          const fields = aisleFields(payload)
          const row = yield* aisleRow(fields.name)
          yield* aisles.upsert(lwwSet(row, fields, entry))
        }).pipe(Effect.orDie),
      )
      .handle("IngredientAisleRemoved", ({ payload, entry }) =>
        Effect.gen(function* () {
          const name = normalizeIngredientName(payload.name)
          const row = yield* aisleRow(name)
          // The aisle only fills a tombstone that a set never wrote.
          yield* aisles.upsert(lwwRemove(row, { name, aisle: "Pantry" }, entry))
        }).pipe(Effect.orDie),
      )
      .handle("GroceryAisleOrderSet", ({ payload, entry }) =>
        Effect.gen(function* () {
          const fields = aisleOrderFields(payload)
          const row = yield* aisleOrderRow(fields.id)
          yield* aisleOrders.upsert(lwwSet(row, fields, entry))
        }).pipe(Effect.orDie),
      )
  }),
)

const GroceryReactivity = EventLog.groupReactivity(GroceryEvents, {
  GroceryItemAdded: ["groceryItems"],
  GroceryItemUpdated: ["groceryItems"],
  GroceryItemToggled: ["groceryItems"],
  GroceryItemDeleted: ["groceryItems"],
  GroceryItemsDeleted: ["groceryItems"],
  IngredientAisleSet: ["ingredientAisles"],
  IngredientAisleRemoved: ["ingredientAisles"],
  GroceryAisleOrderSet: ["groceryAisleOrders"],
})

const GroceryCompaction = Compaction.layer(GroceryEvents, {
  GroceryItemAdded: () => Compaction.create("groceryItems"),
  GroceryItemUpdated: (payload) =>
    Compaction.patch("groceryItems", itemUpdate(payload)),
  GroceryItemToggled: ({ completed }) =>
    Compaction.patch("groceryItems", { completed }),
  GroceryItemDeleted: ({ id }) =>
    Compaction.remove("groceryItems", [uuidString(id)]),
  GroceryItemsDeleted: ({ ids }) =>
    Compaction.remove("groceryItems", ids.map(uuidString)),
  IngredientAisleSet: (payload) =>
    Compaction.set("ingredientAisles", aisleFields(payload)),
  IngredientAisleRemoved: () => Compaction.keep("ingredientAisles"),
  GroceryAisleOrderSet: (payload) =>
    Compaction.set("groceryAisleOrders", aisleOrderFields(payload)),
})

export const GroceriesLayer = Layer.mergeAll(
  GroceryHandlers,
  GroceryReactivity,
  GroceryCompaction,
)
