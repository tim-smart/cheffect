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
  groceryItemChange,
  IngredientAisleEvent,
  IngredientAliasEvent,
} from "@/Groceries/Events"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import type { GroceryAisle } from "@/domain/GroceryItem"
import {
  GroceryItem,
  GroceryItemId,
  GroceryItemIdFromString,
} from "@/domain/GroceryItem"
import { RecipeId } from "@/domain/Recipe"
import { generateUuidBytes } from "@/lib/Id"
import { planGroceryAdds } from "@/Groceries/tidy"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Groceries handlers converge whatever order remote entries arrive in. A
// patch on an item that's missing does nothing, and a remove hard-deletes,
// so a late patch can't bring an item back.
//
// Ingredient aisles are keyed by the normalised name, so every spelling of a
// name writes the same row, and a remove outlasts older sets even when it
// arrives first.
//
// The first set of an item is delivered before the permuted entries: nothing
// can patch or remove an item its device hasn't received.

const itemEvent = GroceryEvents.events[GroceryItemEvent.tag]
const aisleEvent = GroceryEvents.events[IngredientAisleEvent.tag]
const aliasEvent = GroceryEvents.events[IngredientAliasEvent.tag]

const carrots = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000001",
)
const milk = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000002",
)
const butter = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000003",
)
type ItemId = typeof carrots
const soup = RecipeId.make(generateUuidBytes())

const item = (id: ItemId, name: string, msecs: number) =>
  GroceryItem.make({
    id,
    list: "Weekend",
    name,
    quantity: null,
    aisle: null,
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(msecs),
  })

const added = (id: ItemId, name: string, msecs = 1000) =>
  makeEntry({
    msecs,
    event: itemEvent,
    payload: GroceryItemEvent.set(item(id, name, msecs)).payload,
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

const layer: MakeLayer = (identity, remote) => {
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
    ingredientAliases: yield* readTable("ingredientAliases"),
  }
})

test("the newest write to each grocery item field wins across updates and toggles", async () => {
  const { groceryItems } = await converge({
    layer,
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

test("an update or merge made from a copy taken before a check or a quantity edit leaves them", async () => {
  // Both copies are still unchecked and without a quantity, as the device
  // writing them last saw. The merge adds a recipe to Milk.
  const { groceryItems } = await converge({
    layer,
    read,
    setup: [added(carrots, "Carrots"), added(milk, "Milk")],
    concurrent: [
      toggled(2000, carrots, true),
      toggled(2000, milk, true),
      makeEntry({
        msecs: 2500,
        event: itemEvent,
        payload: groceryItemChange(
          item(milk, "Milk", 1000),
          new GroceryItem({ ...item(milk, "Milk", 2500), quantity: "2" }),
        ).payload,
      }),
      makeEntry({
        msecs: 3000,
        event: itemEvent,
        payload: groceryItemChange(
          item(carrots, "Carrots", 1000),
          item(carrots, "Baby carrots", 3000),
        ).payload,
      }),
      makeEntry({
        msecs: 3000,
        event: itemEvent,
        payload: groceryItemChange(
          item(milk, "Milk", 1000),
          new GroceryItem({ ...item(milk, "Milk", 3000), recipeIds: [soup] }),
        ).payload,
      }),
    ],
  })
  assert.deepEqual(
    groceryItems.map((row) =>
      pick(row, ["name", "quantity", "recipeIds", "completed"]),
    ),
    [
      {
        name: "Baby carrots",
        quantity: null,
        recipeIds: null,
        completed: true,
      },
      { name: "Milk", quantity: "2", recipeIds: [soup], completed: true },
    ],
  )
})

test("an add merged into a line with a blank quantity keeps a quantity set meanwhile", async () => {
  // The add is planned from a copy where Butter's quantity is blank, so it
  // keeps it as read and writes only the recipe.
  const blankButter = new GroceryItem({
    ...item(butter, "Butter", 1000),
    quantity: " ",
  })
  const [merge] = planGroceryAdds({
    existing: [blankButter],
    aisles: new Map(),
    aliases: new Map(),
    incoming: [
      new GroceryItem({
        ...item(GroceryItemId.make(generateUuidBytes()), "Butter", 3000),
        recipeIds: [soup],
      }),
    ],
    now: DateTime.makeUnsafe(3000),
  })
  assert.ok(merge.op === "change")
  const { groceryItems } = await converge({
    layer,
    read,
    setup: [
      makeEntry({
        msecs: 1000,
        event: itemEvent,
        payload: GroceryItemEvent.set(blankButter).payload,
      }),
    ],
    concurrent: [
      makeEntry({
        msecs: 2500,
        event: itemEvent,
        payload: groceryItemChange(
          blankButter,
          new GroceryItem({ ...blankButter, quantity: "2" }),
        ).payload,
      }),
      makeEntry({
        msecs: 3000,
        event: itemEvent,
        payload: groceryItemChange(merge.previous, merge.item).payload,
      }),
    ],
  })
  assert.deepEqual(pick(only(groceryItems), ["quantity", "recipeIds"]), {
    quantity: "2",
    recipeIds: [soup],
  })
})

test("a deleted grocery item stays deleted, with writes either side of the delete", async () => {
  const { groceryItems } = await converge({
    layer,
    read,
    setup: [added(carrots, "Carrots"), added(milk, "Milk")],
    concurrent: [
      toggled(2000, carrots, true),
      deleted(3000, carrots),
      // A write from a device that hadn't seen the delete yet.
      updated(4000, carrots, { name: "Leeks", completed: false }),
    ],
  })
  assert.deepEqual(pick(only(groceryItems), ["id", "name"]), {
    id: milk,
    name: "Milk",
  })
})

test("an ingredient aisle remove outlasts older sets and yields to newer ones, whatever arrives first", async () => {
  // Every spelling lands on the normalised name.
  const carrots = await converge({
    layer,
    read,
    concurrent: [
      aisleSet(1000, "Carrots", "Produce"),
      aisleRemoved(2000, " carrots"),
      aisleSet(3000, "CARROTS ", "Deli"),
    ],
  })
  assert.deepEqual(carrots.ingredientAisles, [
    { name: "carrots", aisle: "Deli" },
  ])
  const milk = await converge({
    layer,
    read,
    concurrent: [
      aisleSet(1500, "Milk", "Dairy & Eggs"),
      aisleRemoved(2500, "milk"),
    ],
  })
  assert.deepEqual(milk.ingredientAisles, [])
})

test("a user's alias and the AI's for the same name are separate rows, so a later AI write never replaces the user's", async () => {
  const set = (
    msecs: number,
    name: string,
    source: "user" | "ai",
    canonical: string | null,
  ) =>
    makeEntry({
      msecs,
      event: aliasEvent,
      payload: IngredientAliasEvent.set({ name, source, canonical }).payload,
    })
  const { ingredientAliases } = await converge({
    layer,
    read,
    concurrent: [
      set(1000, "Garlic, minced", "user", null),
      set(2000, "garlic, minced ", "ai", "Garlic"),
      set(3000, "GARLIC, MINCED", "ai", "Garlic clove"),
    ],
  })
  assert.deepEqual(
    ingredientAliases.map((row) => pick(row, ["name", "source", "canonical"])),
    [
      { name: "garlic, minced", source: "ai", canonical: "Garlic clove" },
      { name: "garlic, minced", source: "user", canonical: null },
    ],
  )
})
