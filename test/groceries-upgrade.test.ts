import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import { journalDatabaseName } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { GroceriesLayer } from "@/Groceries"
import { GroceryEvents } from "@/Groceries/Events"
import { GroceryRepo } from "@/Groceries/Repo"
import {
  addGroceryItem,
  addGroceryItems,
  deleteGroceryItems,
  updateGroceryItems,
} from "@/Groceries/runtime"
import {
  type GroceryAisle,
  GroceryItem,
  GroceryItemId,
  PANTRY_GROCERY_LIST_NAME,
} from "@/domain/GroceryItem"
import { generateUuidBytes } from "@/lib/Id"
import { readTable } from "./harness/convergence"
import { makeFakeRemote, testIdentity } from "./harness/eventlog"
import { freshIndexedDb } from "./harness/indexeddb"

// Devices don't upgrade together. A device still on the last shipped build
// syncs whatever an upgraded device writes, then upgrades itself. Once it has,
// its grocery list has to match the writer's. An entry the old build couldn't
// handle is already in its journal, so sync won't bring it back.
//
// The old build is the current handlers minus any grocery event that build
// didn't have.

const shippedEvents = new Set([
  "GroceryItemAdded",
  "GroceryItemUpdated",
  "GroceryItemToggled",
  "GroceryItemDeleted",
  "GroceryItemsDeleted",
  "IngredientAisleSet",
  "IngredientAisleRemoved",
  "GroceryAisleOrderSet",
])

const shippedGroceries = Layer.effectDiscard(
  EventLog.Registry.use((registry) =>
    Effect.sync(() => {
      const handlers = registry.handlers as Map<string, unknown>
      for (const event of Array.from(handlers.keys())) {
        if (!shippedEvents.has(event)) handlers.delete(event)
      }
    }),
  ),
).pipe(Layer.provideMerge(GroceriesLayer))

const device = (options: {
  readonly indexedDb: IndexedDb.IndexedDb
  readonly handlers: Layer.Layer<never, never, any>
  readonly remote?: Layer.Layer<never, never, EventLog.Registry>
}) => {
  const eventLog = EventLog.layer(
    EventLog.schema(GroceryEvents),
    options.handlers,
  ).pipe(
    Layer.provide(
      EventJournal.layerIndexedDb({ database: journalDatabaseName }),
    ),
    Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  )
  return Layer.mergeAll(
    eventLog,
    (options.remote ?? Layer.empty).pipe(Layer.provide(eventLog)),
  ).pipe(
    Layer.provideMerge(GroceryRepo.layer),
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(Layer.succeed(IndexedDb.IndexedDb, options.indexedDb)),
  )
}

const tables = Effect.gen(function* () {
  return {
    groceryItems: yield* readTable("groceryItems"),
    ingredientAisles: yield* readTable("ingredientAisles"),
  }
})

// The writer's tables, and the old device's once it has synced the writer's
// entries and upgraded.
const writeThenUpgrade = async <E>(
  write: Effect.Effect<void, E, any>,
): Promise<{
  readonly writer: Effect.Success<typeof tables>
  readonly upgraded: Effect.Success<typeof tables>
}> => {
  const { writer, entries } = await Effect.gen(function* () {
    yield* write
    return {
      writer: yield* tables,
      entries: yield* EventLog.EventLog.use((log) => log.entries),
    }
  }).pipe(
    Effect.provide(
      device({ indexedDb: freshIndexedDb(), handlers: GroceriesLayer }),
    ),
    Effect.runPromise,
  )

  const indexedDb = freshIndexedDb()
  await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    yield* remote.deliver(entries).pipe(
      Effect.timeout("5 seconds"),
      Effect.provide(
        device({
          indexedDb,
          handlers: shippedGroceries,
          remote: remote.layer,
        }),
      ),
    )
  }).pipe(Effect.runPromise)

  const upgraded = await tables.pipe(
    Effect.provide(device({ indexedDb, handlers: GroceriesLayer })),
    Effect.runPromise,
  )
  return { writer, upgraded }
}

const item = (
  name: string,
  options: {
    readonly aisle?: GroceryAisle | null
    readonly list?: string | null
    readonly completed?: boolean
  } = {},
) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list: options.list ?? null,
    name,
    quantity: null,
    aisle: options.aisle ?? null,
    recipeIds: null,
    completed: options.completed ?? false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
  })

test("a recipe added on an upgraded device shows on a device that upgrades later", async () => {
  const { writer, upgraded } = await writeThenUpgrade(
    addGroceryItems([
      item("Carrots", { aisle: "Produce" }),
      item("Onion", { aisle: "Produce" }),
      item("Stock"),
    ]),
  )
  assert.equal(writer.groceryItems.length, 3)
  assert.deepEqual(upgraded, writer)
})

test("completed items moved on an upgraded device aren't lost on a device that upgrades later", async () => {
  const milk = item("Milk", { aisle: "Dairy & Eggs", completed: true })
  const { writer, upgraded } = await writeThenUpgrade(
    Effect.gen(function* () {
      yield* addGroceryItem(milk)
      yield* addGroceryItems([
        new GroceryItem({
          ...item("Milk", { aisle: "Dairy & Eggs" }),
          list: PANTRY_GROCERY_LIST_NAME,
        }),
      ])
      yield* deleteGroceryItems([milk.id])
    }),
  )
  assert.equal(writer.groceryItems.length, 1)
  assert.deepEqual(upgraded, writer)
})

test("a list beautified on an upgraded device matches on a device that upgrades later", async () => {
  const carrots = item("2 carrots", { aisle: "Produce" })
  const onion = item("1 onion", { aisle: "Produce" })
  const extra = item("x")
  const { writer, upgraded } = await writeThenUpgrade(
    Effect.gen(function* () {
      for (const added of [carrots, onion, extra]) {
        yield* addGroceryItem(added)
      }
      yield* deleteGroceryItems([extra.id])
      yield* updateGroceryItems([
        {
          item: new GroceryItem({ ...carrots, name: "Carrots" }),
          previousName: carrots.name,
        },
        {
          item: new GroceryItem({ ...onion, name: "Onion" }),
          previousName: onion.name,
        },
      ])
    }),
  )
  assert.deepEqual(writer.groceryItems.map((row) => row.name).sort(), [
    "Carrots",
    "Onion",
  ])
  assert.deepEqual(upgraded, writer)
})
