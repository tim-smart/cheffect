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
import {
  GroceryEvents,
  GroceryItemEvent,
  IngredientAisleEvent,
} from "@/Groceries/Events"
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
  withoutCompaction,
} from "./harness/convergence"

// The Groceries handlers converge whatever order remote entries arrive in. A
// patch on an item that's missing does nothing, and a remove hard-deletes,
// so a late patch can't bring an item back. A clear removes only the items
// its writer saw, so an item added concurrently survives it.
//
// Ingredient aisles are keyed by the normalised name, so every spelling of a
// name writes the same row, and a remove outlasts older sets even when it
// arrives first.
//
// The first set of an item is delivered before the permuted entries: nothing
// can patch or remove an item its device hasn't received. Each order is also
// replayed uncompacted and one entry at a time.

const itemEvent = GroceryEvents.events[GroceryItemEvent.tag]
const aisleEvent = GroceryEvents.events[IngredientAisleEvent.tag]

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
    event: itemEvent,
    payload: GroceryItemEvent.set(
      GroceryItem.make({
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
    ).payload,
  })

const updated = (
  msecs: number,
  id: ItemId,
  fields: { readonly name: string; readonly completed: boolean },
) =>
  makeEntry({
    msecs,
    event: itemEvent,
    payload: GroceryItemEvent.patch(
      { id },
      {
        ...fields,
        quantity: "2",
        aisle: "Produce",
        recipeIds: null,
        updatedAt: DateTime.makeUnsafe(msecs),
      },
    ).payload,
  })

const toggled = (msecs: number, id: ItemId, completed: boolean) =>
  makeEntry({
    msecs,
    event: itemEvent,
    payload: GroceryItemEvent.patch(
      { id },
      {
        completed,
      },
    ).payload,
  })

const deleted = (msecs: number, id: ItemId) =>
  makeEntry({
    msecs,
    event: itemEvent,
    payload: GroceryItemEvent.remove({ id }).payload,
  })

const aisleSet = (msecs: number, name: string, aisle: GroceryAisle) =>
  makeEntry({
    msecs,
    event: aisleEvent,
    payload: IngredientAisleEvent.set({ name, aisle }).payload,
  })

const aisleRemoved = (msecs: number, name: string) =>
  makeEntry({
    msecs,
    event: aisleEvent,
    payload: IngredientAisleEvent.remove({ name }).payload,
  })

const makeLayer =
  (handlers: typeof GroceriesLayer): MakeLayer =>
  (identity, remote) => {
    const eventLog = EventLog.layer(
      EventLog.schema(GroceryEvents),
      handlers,
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

const layers = {
  layer: makeLayer(GroceriesLayer),
  uncompacted: makeLayer(withoutCompaction(GroceriesLayer)),
}

const read = Effect.gen(function* () {
  return {
    groceryItems: yield* readTable("groceryItems"),
    ingredientAisles: yield* readTable("ingredientAisles"),
  }
})

test("the newest write to each grocery item field wins across updates and toggles", async () => {
  const { groceryItems } = await converge({
    ...layers,
    read,
    setup: [added(carrots, "Carrots"), added(milk, "Milk")],
    concurrent: [
      updated(2000, carrots, { name: "Leeks", completed: false }),
      toggled(3000, carrots, true),
      updated(2500, carrots, { name: "Baby leeks", completed: false }),
    ],
  })
  // An update never moves an item to another list.
  assert.deepEqual(
    groceryItems.map((row) => pick(row, ["name", "completed", "list"])),
    [
      { name: "Baby leeks", completed: true, list: "Weekend" },
      { name: "Milk", completed: false, list: "Weekend" },
    ],
  )
})

test("a deleted grocery item stays deleted, with updates and toggles either side of the delete", async () => {
  const { groceryItems } = await converge({
    ...layers,
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
    ...layers,
    read,
    setup: [added(carrots, "Carrots"), added(milk, "Milk")],
    concurrent: [
      // Added on another device before the clear, but never seen by it.
      added(bread, "Bread", 2500),
      // The clear removes each item its writer saw.
      deleted(3000, carrots),
      deleted(3000, milk),
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
    ...layers,
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
  assert.deepEqual(ingredientAisles, [{ name: "carrots", aisle: "Deli" }])
})
