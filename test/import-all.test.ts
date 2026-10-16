import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { writeEvent } from "@/EventLog"
import { ExportFile, ExportFileJson, importAll } from "@/ExportFile"
import { eventSamples } from "./fixtures/event-samples"
import { journalEntries, layerCheffect, snapshot } from "./harness/cheffect"

// "Import all data" (TIM-256, TIM-258). Import validates the whole file before
// it writes anything, then replays the events as ordinary writes, so it merges
// rather than restores: importing a file twice gives the state importing it
// once does, and a row deleted after the export stays deleted.

// The create and set events "Export all data" writes, one table each.
const exportedTables = {
  RecipeCreated: "recipes",
  RecipeEditSet: "recipeEdits",
  GroceryItemAdded: "groceryItems",
  IngredientAisleSet: "ingredientAisles",
  GroceryAisleOrderSet: "groceryAisleOrders",
  MealPlanAdd: "mealPlan",
  MealPlanDayNoteAdd: "mealPlanDayNotes",
  MenuAdd: "menus",
  MenuEntryAdd: "menuEntries",
  MenuDayNoteAdd: "menuDayNotes",
  AIMemoryEntryAdded: "aiMemoryEntries",
  TimerAdded: "timers",
  SettingsSet: "settings",
} as const

const sample = (event: string) =>
  eventSamples.find((sample) => sample.event === event)!

type ExportEvent = (typeof ExportFile.Type)["events"][number]

const file = Schema.encodeSync(ExportFileJson)({
  format: "cheffect-export",
  version: 1,
  events: Object.keys(exportedTables).map(
    (event) =>
      ({
        tag: event,
        payload: sample(event).payload,
      }) as unknown as ExportEvent,
  ),
})

const run = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof layerCheffect>>,
) =>
  effect.pipe(
    Effect.timeout("10 seconds"),
    Effect.provide(layerCheffect),
    Effect.runPromise,
  )

test("importing the same file twice gives the state importing it once does", async () => {
  const { once, twice } = await run(
    Effect.gen(function* () {
      yield* importAll(file)
      const once = yield* snapshot
      yield* importAll(file)
      const twice = yield* snapshot
      return { once, twice }
    }),
  )
  for (const table of Object.values(exportedTables)) {
    assert.equal(once[table].length, 1, `${table} after one import`)
  }
  assert.deepStrictEqual(twice, once)
})

test("a recipe deleted after the export stays deleted when the file is imported again", async () => {
  const { deleted, reimported } = await run(
    Effect.gen(function* () {
      yield* importAll(file)
      yield* writeEvent(sample("RecipeDeleted"))
      const deleted = yield* snapshot
      yield* importAll(file)
      const reimported = yield* snapshot
      return { deleted, reimported }
    }),
  )
  assert.notEqual(deleted.recipes[0].deletedAt, null)
  assert.deepStrictEqual(reimported, deleted)
})

// Grocery items hard-delete (TIM-248 rule 4), so once the row is gone the
// handler can't tell a re-import's `GroceryItemAdded` from a first one.
test("a grocery item deleted after the export stays deleted when the file is imported again", async () => {
  const { deleted, reimported } = await run(
    Effect.gen(function* () {
      yield* importAll(file)
      yield* writeEvent(sample("GroceryItemDeleted"))
      const deleted = yield* snapshot
      yield* importAll(file)
      const reimported = yield* snapshot
      return { deleted, reimported }
    }),
  )
  assert.deepEqual(deleted.groceryItems, [])
  assert.deepStrictEqual(reimported, deleted)
})

const parsed = JSON.parse(file)
const last = parsed.events.at(-1)

const badFiles = {
  "one invalid event": JSON.stringify({
    ...parsed,
    events: [...parsed.events.slice(0, -1), { tag: last.tag, payload: {} }],
  }),
  "an unknown version": JSON.stringify({ ...parsed, version: 2 }),
  "an unknown format": JSON.stringify({ ...parsed, format: "something-else" }),
}

for (const [name, bad] of Object.entries(badFiles)) {
  test(`a file with ${name} writes nothing`, async () => {
    const { exit, entries, state } = await run(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(importAll(bad))
        const entries = yield* journalEntries
        const state = yield* snapshot
        return { exit, entries, state }
      }),
    )
    assert.ok(Exit.isFailure(exit), "the import should fail")
    assert.equal(entries.length, 0)
    for (const [table, rows] of Object.entries(state)) {
      assert.deepEqual(rows, [], `${table} should be empty`)
    }
  })
}
