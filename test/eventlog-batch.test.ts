import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import {
  type EventPayload,
  journalDatabaseName,
  layerHandlerTransaction,
  layerJournal,
  writeEvents,
} from "@/EventLog"
import { GroceriesLayer } from "@/Groceries"
import {
  GroceryEvents,
  GroceryItemEvent,
  groceryItemUpdate,
  IngredientAisleEvent,
} from "@/Groceries/Events"
import { QueryBuilder, databaseName, layerDatabase } from "@/IndexedDb"
import { GroceryItem, GroceryItemId } from "@/domain/GroceryItem"
import { generateUuidBytes } from "@/lib/Id"
import { readTable } from "./harness/convergence"
import {
  type FakeRemote,
  makeFakeRemote,
  testIdentity,
} from "./harness/eventlog"
import { countRecords, layerFreshIndexedDb } from "./harness/indexeddb"

// `writeEvents` through Effect's `writeMany`, with the app's handler
// transaction wrapping a batch's handlers. Every entry is stamped in the same
// millisecond, so only the batch's own ordering keeps them in the order they
// were written.

const device = (
  remote: FakeRemote,
  handlers: typeof GroceriesLayer = GroceriesLayer,
) => {
  const eventLog = EventLog.layer(
    EventLog.schema(GroceryEvents),
    handlers,
  ).pipe(
    Layer.provideMerge(layerJournal),
    Layer.provide(layerHandlerTransaction),
    Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  )
  return Layer.mergeAll(
    eventLog,
    remote.layer.pipe(Layer.provide(eventLog)),
  ).pipe(
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
}

const item = (name: string) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list: null,
    name,
    quantity: null,
    aisle: null,
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
  })

const journalEvents = EventLog.EventLog.use((log) => log.entries).pipe(
  Effect.map((entries) => [...entries].sort(EventJournal.Entry.Order)),
)

// The ids the remote has received, each once, in the order first sent, once
// it has received `count` of them.
const awaitUploads = (remote: FakeRemote, count: number) =>
  Effect.gen(function* () {
    while (true) {
      const ids = [...new Set((yield* remote.uploaded).map((e) => e.idString))]
      if (ids.length >= count) return ids
      yield* Effect.sleep("2 millis")
    }
  }).pipe(Effect.timeout("5 seconds"))

test("a batch is on disk when it returns, in the order written, and uploaded", async () => {
  const milk = item("Milk")
  const eggs = item("Eggs")
  const batch: Array<EventPayload> = [
    GroceryItemEvent.set(milk),
    GroceryItemEvent.set(eggs),
    groceryItemUpdate(new GroceryItem({ ...milk, name: "Oat milk" })),
    GroceryItemEvent.remove({ id: eggs.id }),
    IngredientAisleEvent.set({
      name: "oat milk",
      aisle: "Dairy & Eggs",
    }),
    IngredientAisleEvent.remove({ name: "milk" }),
  ]

  const result = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* writeEvents(batch)
      const { indexedDB } = yield* IndexedDb.IndexedDb
      const onDisk = {
        entries: yield* countRecords(indexedDB, journalDatabaseName, "entries"),
        groceryItems: yield* countRecords(
          indexedDB,
          databaseName,
          "groceryItems",
        ),
      }
      const entries = yield* journalEvents
      return {
        onDisk,
        events: entries.map((entry) => [entry.event, entry.primaryKey]),
        ids: entries.map((entry) => entry.idString),
        uploaded: yield* awaitUploads(remote, batch.length),
        items: (yield* readTable("groceryItems")).map((row) => row.name),
      }
    }).pipe(Effect.provide(device(remote)))
  }).pipe(Effect.runPromise)

  assert.deepEqual(result.onDisk, { entries: 6, groceryItems: 1 })
  assert.deepEqual(result.events, [
    ["GroceryItem", milk.idString],
    ["GroceryItem", eggs.idString],
    ["GroceryItem", milk.idString],
    ["GroceryItem", eggs.idString],
    ["IngredientAisle", "oat milk"],
    ["IngredientAisle", "milk"],
  ])
  assert.deepEqual(result.uploaded, result.ids)
  assert.deepEqual(result.items, ["Oat milk"])
})

// An item remove fails, after the sets before it in the batch have run.
const failingDelete = Layer.effectDiscard(
  EventLog.Registry.use((registry) =>
    Effect.sync(() => {
      const handlers = registry.handlers as Map<
        string,
        EventLog.Handlers.Item<any>
      >
      const handler = handlers.get(GroceryItemEvent.tag)!
      handlers.set(GroceryItemEvent.tag, {
        ...handler,
        handler: (options) =>
          (options.payload as { readonly _tag: string })._tag === "remove"
            ? Effect.die("delete failed")
            : handler.handler(options),
      })
    }),
  ),
).pipe(Layer.provideMerge(GroceriesLayer))

test("a handler failure leaves none of its batch written or uploaded", async () => {
  const milk = item("Milk")
  const eggs = item("Eggs")
  const bread = item("Bread")

  const result = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      const failed = yield* Effect.exit(
        writeEvents([
          GroceryItemEvent.set(milk),
          GroceryItemEvent.set(eggs),
          GroceryItemEvent.remove({ id: milk.id }),
        ]),
      )
      const afterFailure = {
        items: yield* readTable("groceryItems"),
        entries: (yield* journalEvents).length,
      }
      // A later batch goes through, and is all the remote ever receives.
      yield* writeEvents([GroceryItemEvent.set(bread)])
      const uploaded = yield* awaitUploads(remote, 1)
      return {
        failed: Exit.isFailure(failed),
        afterFailure,
        uploaded,
        written: (yield* journalEvents).map((entry) => entry.idString),
      }
    }).pipe(Effect.provide(device(remote, failingDelete)))
  }).pipe(Effect.runPromise)

  assert.equal(result.failed, true)
  assert.deepEqual(result.afterFailure, { items: [], entries: 0 })
  assert.equal(result.written.length, 1)
  assert.deepEqual(result.uploaded, result.written)
})
