import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import { EventLogClient, eventLogAtom, journalDatabaseName } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { GroceriesLayer } from "@/Groceries"
import { groceriesRuntime, groceryItemAddAtom } from "@/Groceries/runtime"
import { GroceryEvents } from "@/Groceries/Events"
import { GroceryItem, GroceryItemIdFromString } from "@/domain/GroceryItem"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// Every grocery item a user submits is written, even when the next submission
// comes before the previous one has finished. The add atom lives next to the
// runtime, away from the AI and LiveStore imports that can't load in node.

// The app's EventLog runtime on fake-indexeddb, with the Groceries handlers.
const layer = EventLogClient.layer.pipe(
  Layer.provideMerge(
    EventLog.layer(EventLog.schema(GroceryEvents), GroceriesLayer).pipe(
      Layer.provide(
        EventJournal.layerIndexedDb({ database: journalDatabaseName }),
      ),
    ),
  ),
  Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(layerFreshIndexedDb),
)

const carrotsIdString = "0193c7a0-1b2c-4def-8123-c0ffee000001"
const milkIdString = "0193c7a0-1b2c-4def-8123-c0ffee000002"

const item = (idString: string, name: string) =>
  GroceryItem.insert.make({
    id: Schema.decodeSync(GroceryItemIdFromString)(idString),
    list: null,
    name,
    quantity: null,
    aisle: "Produce",
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
  })

test("adding a grocery item while the previous add is still writing keeps both", async () => {
  const registry = AtomRegistry.make({
    initialValues: [[eventLogAtom.layer, layer]],
  })
  // Mounted and built, as the groceries page keeps them.
  const unmountEventLog = registry.mount(eventLogAtom)
  const unmountRuntime = registry.mount(groceriesRuntime)
  const unmountAdd = registry.mount(groceryItemAddAtom)
  const added = await Effect.gen(function* () {
    const context = yield* Atom.getResult(eventLogAtom)
    yield* Atom.getResult(groceriesRuntime)
    registry.set(
      groceryItemAddAtom,
      new GroceryItem(item(carrotsIdString, "Carrots")),
    )
    // The first add is under way before the second, as two separate submits.
    registry.get(groceryItemAddAtom)
    registry.set(
      groceryItemAddAtom,
      new GroceryItem(item(milkIdString, "Milk")),
    )
    yield* Atom.getResult(groceryItemAddAtom, { suspendOnWaiting: true })

    const entries = yield* EventLog.EventLog.use((log) => log.entries).pipe(
      Effect.provideContext(context),
    )
    return entries
      .filter((entry) => entry.event === "GroceryItemAdded")
      .map((entry) => entry.primaryKey)
      .sort()
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.provideService(AtomRegistry.AtomRegistry, registry),
    Effect.ensuring(
      Effect.sync(() => {
        unmountAdd()
        unmountRuntime()
        unmountEventLog()
        registry.dispose()
      }),
    ),
    Effect.runPromise,
  )
  assert.deepEqual(added, [carrotsIdString, milkIdString])
})
