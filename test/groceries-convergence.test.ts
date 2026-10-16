import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { GroceriesLayer } from "@/Groceries"
import { GroceryEvents } from "@/Groceries/Events"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import type { GroceryAisle } from "@/domain/GroceryItem"
import { GroceryItem, GroceryItemIdFromString } from "@/domain/GroceryItem"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Groceries handlers converge whatever order remote entries arrive in:
// `GroceryItemAdded` creates, `GroceryItemUpdated` and
// `GroceryItemToggled` patch under last-writer-wins and do nothing when the
// item is missing, and `GroceryItemDeleted` hard-deletes, so a late update
// can't bring an item back. `GroceryItemsDeleted` hard-deletes only the ids
// its writer saw, so an item added concurrently survives the clear.
//
// Ingredient aisles have reusable keys: a set upserts under
// last-writer-wins, and a remove leaves a tombstone (`deleted: 1`) that only a
// newer set revives, even when the remove arrives before the set.
//
// The first add of an item is delivered before the permuted entries: nothing
// can update or delete an item its device hasn't received.

const {
  GroceryItemAdded,
  GroceryItemUpdated,
  GroceryItemToggled,
  GroceryItemDeleted,
  GroceryItemsDeleted,
  IngredientAisleSet,
  IngredientAisleRemoved,
} = GroceryEvents.events

const carrots = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000001",
)
const milk = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000002",
)
const bread = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000003",
)
type ItemId = typeof carrots

const added = (id: ItemId, name: string, msecs = 1000) =>
  makeEntry({
    msecs,
    event: GroceryItemAdded,
    payload: GroceryItem.insert.make({
      id,
      list: "Weekend",
      name,
      quantity: null,
      aisle: null,
      recipeIds: null,
      completed: false,
      createdAt: DateTime.makeUnsafe(msecs),
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const updated = (
  msecs: number,
  id: ItemId,
  fields: { readonly name: string; readonly completed: boolean },
) =>
  makeEntry({
    msecs,
    event: GroceryItemUpdated,
    payload: GroceryItem.update.make({
      id,
      ...fields,
      quantity: "2",
      aisle: "Produce",
      recipeIds: null,
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const toggled = (msecs: number, id: ItemId, completed: boolean) =>
  makeEntry({ msecs, event: GroceryItemToggled, payload: { id, completed } })

const deleted = (msecs: number, id: ItemId) =>
  makeEntry({ msecs, event: GroceryItemDeleted, payload: { id } })

const cleared = (msecs: number, ids: readonly [ItemId, ...Array<ItemId>]) =>
  makeEntry({ msecs, event: GroceryItemsDeleted, payload: { ids } })

const aisleSet = (msecs: number, name: string, aisle: GroceryAisle) =>
  makeEntry({ msecs, event: IngredientAisleSet, payload: { name, aisle } })

const aisleRemoved = (msecs: number, name: string) =>
  makeEntry({ msecs, event: IngredientAisleRemoved, payload: { name } })

const makeLayer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(GroceryEvents),
    GroceriesLayer,
  ).pipe(
    Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
  )
  return Layer.mergeAll(eventLog, remote.pipe(Layer.provide(eventLog))).pipe(
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
}

const read = Effect.gen(function* () {
  return {
    groceryItems: yield* readTable("groceryItems"),
    ingredientAisles: yield* readTable("ingredientAisles"),
  }
})

test("a deleted grocery item stays deleted, with updates and toggles either side of the delete", async () => {
  const { groceryItems } = await converge({
    layer: makeLayer,
    read,
    setup: [added(carrots, "Carrots"), added(milk, "Milk")],
    concurrent: [
      toggled(2000, carrots, true),
      deleted(3000, carrots),
      // Writes from a device that hadn't seen the delete yet.
      updated(4000, carrots, { name: "Leeks", completed: false }),
      toggled(4500, carrots, false),
    ],
  })
  assert.deepEqual(pick(only(groceryItems), ["id", "name"]), {
    id: milk,
    name: "Milk",
  })
})

test("a clear deletes the items it saw and none added concurrently, whatever arrives first", async () => {
  const { groceryItems } = await converge({
    layer: makeLayer,
    read,
    setup: [added(carrots, "Carrots"), added(milk, "Milk")],
    concurrent: [
      toggled(2000, carrots, true),
      // Added on another device before the clear, but never seen by it.
      added(bread, "Bread", 2500),
      cleared(3000, [carrots, milk]),
      // An update from a device that hadn't seen the clear yet.
      updated(4000, milk, { name: "Oat milk", completed: false }),
    ],
  })
  assert.deepEqual(pick(only(groceryItems), ["id", "name"]), {
    id: bread,
    name: "Bread",
  })
})

test("an ingredient aisle remove outlasts older sets and yields to newer ones, whatever arrives first", async () => {
  const { ingredientAisles } = await converge({
    layer: makeLayer,
    read,
    concurrent: [
      // Every spelling lands on the normalised name.
      aisleSet(1000, "Carrots", "Produce"),
      aisleRemoved(2000, " carrots"),
      aisleSet(3000, "CARROTS ", "Deli"),
      aisleSet(1500, "Milk", "Dairy & Eggs"),
      aisleRemoved(2500, "milk"),
    ],
  })
  assert.deepEqual(
    ingredientAisles.map((row) => pick(row, ["name", "aisle", "deleted"])),
    [
      { name: "carrots", aisle: "Deli", deleted: 0 },
      { name: "milk", aisle: "Dairy & Eggs", deleted: 1 },
    ],
  )
})
