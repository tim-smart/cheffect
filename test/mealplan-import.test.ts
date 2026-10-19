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
import {
  EventLogClient,
  eventLogAtom,
  journalDatabaseName,
  writeEvent,
} from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MealPlanLayer } from "@/MealPlan"
import { MealPlanEntryEvent, MealPlanEvents } from "@/MealPlan/Events"
import { importMealPlanAtom } from "@/MealPlan/runtime"
import { RecipesLayer } from "@/Recipes"
import { RecipeEvents } from "@/Recipes/Events"
import { MealPlanEntryIdFromString } from "@/domain/MealPlanEntry"
import { RecipeIdFromString } from "@/domain/Recipe"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// Backup import writes a `set` only for entries this device doesn't have. A
// `set` replaces the whole row as the newest write, so one for an entry that
// exists here would undo edits made since the backup.
//
// Known limitation: a device that hasn't synced the original entry yet still
// writes a `set` for it, which can bring it back after a remove on another
// device.

// The app's EventLog runtime on fake-indexeddb, with the handlers this test
// writes through.
const layer = EventLogClient.layer.pipe(
  Layer.provideMerge(
    EventLog.layer(
      EventLog.schema(RecipeEvents, MealPlanEvents),
      Layer.mergeAll(RecipesLayer, MealPlanLayer),
    ).pipe(
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

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)
const plannedIdString = "0193c7a0-1b2c-4def-8123-0123456789a1"
const newIdString = "0193c7a0-1b2c-4def-8123-0123456789a2"
const planned = Schema.decodeSync(MealPlanEntryIdFromString)(plannedIdString)
const fromBackup = Schema.decodeSync(MealPlanEntryIdFromString)(newIdString)
const monday = DateTime.makeUnsafe("2025-10-13")

test("importing a backup skips meal plan entries this device already has", async () => {
  const registry = AtomRegistry.make({
    initialValues: [[eventLogAtom.layer, layer]],
  })
  // Mounted, as the app's components keep it, so its database stays open.
  const unmount = registry.mount(eventLogAtom)
  const adds = await Effect.gen(function* () {
    const context = yield* Atom.getResult(eventLogAtom)
    yield* writeEvent({
      event: MealPlanEntryEvent.tag,
      payload: MealPlanEntryEvent.set({ id: planned, recipeId, day: monday }),
    }).pipe(Effect.provideContext(context))

    registry.set(importMealPlanAtom, {
      entries: [
        { id: planned, recipeId, day: monday },
        { id: fromBackup, recipeId, day: monday },
      ],
      notes: [],
    })
    yield* Atom.getResult(importMealPlanAtom, { suspendOnWaiting: true })

    const entries = yield* EventLog.EventLog.use((log) => log.entries).pipe(
      Effect.provideContext(context),
    )
    return entries
      .filter((entry) => entry.event === MealPlanEntryEvent.tag)
      .map((entry) => entry.primaryKey)
      .sort()
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.provideService(AtomRegistry.AtomRegistry, registry),
    Effect.ensuring(
      Effect.sync(() => {
        unmount()
        registry.dispose()
      }),
    ),
    Effect.runPromise,
  )
  // One set for the entry that was already here, and one for the new entry.
  assert.deepEqual(adds, [plannedIdString, newIdString])
})
