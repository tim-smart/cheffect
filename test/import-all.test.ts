import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as EventJournal from "effect/eventlog/EventJournal"
import { AiChatTurnEvent } from "@/AiChat/Events"
import { CheffectEvents, type EventPayload, writeEvent } from "@/EventLog"
import { ExportFileJson, exportAll, importAll } from "@/ExportFile"
import { GroceryItemEvent } from "@/Groceries/Events"
import { MenuEvent, menuUpdate } from "@/Menus/Events"
import { RecipeEditEvent, RecipeEvent, recipeDeleted } from "@/Recipes/Events"
import { SettingEvent } from "@/Settings/Events"
import { AiChatTurnIdFromString } from "@/domain/AiChatTurn"
import { MenuIdFromString } from "@/domain/Menu"
import { RecipeIdFromString } from "@/domain/Recipe"
import { sampleRecipe } from "./fixtures/event-samples"
import { journalEntries, layerCheffect, snapshot } from "./harness/cheffect"
import { makeEntry, makeFakeRemote } from "./harness/eventlog"

// "Import all data". Import validates the whole file before it writes
// anything, then writes each row as an ordinary `set`, so it merges rather
// than restores: importing a file twice gives the state importing it once
// does, and a row this device has already seen is left as it is here.
//
// `export-v1.json` is a file in the format exported before rows: one create
// or set event per row, one of each kind.

const v1File = readFileSync(
  new URL("./fixtures/export-v1.json", import.meta.url),
  "utf8",
)

const exportedTables = [
  "recipes",
  "recipeEdits",
  "groceryItems",
  "ingredientAisles",
  "groceryAisleOrders",
  "mealPlan",
  "mealPlanDayNotes",
  "menus",
  "menuEntries",
  "menuDayNotes",
  "aiMemoryEntries",
  "timers",
  "settings",
] as const

const groceryItemId = "0193c7a0-1b2c-4def-8123-c0ffee000001"
const menuId = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f6",
)

const run = <A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof layerCheffect>>,
) =>
  effect.pipe(
    Effect.timeout("10 seconds"),
    Effect.provide(layerCheffect),
    Effect.runPromise,
  )

test("a version 1 export imports as the rows its events created", async () => {
  const state = await run(importAll(v1File).pipe(Effect.andThen(snapshot)))
  for (const table of exportedTables) {
    assert.equal(state[table].length, 1, table)
  }
  // A recipe created then had no ingredient scale, and an item added
  // without a list is on the default one.
  assert.equal(state.recipes[0].ingredientScale, 1)
  assert.equal(state.groceryItems[0].list, null)
  // Learned aisles and aisle orders are stored under their row keys.
  assert.deepEqual(state.ingredientAisles, [
    { name: "carrots", aisle: "Produce" },
  ])
  assert.equal(state.groceryAisleOrders[0].id, '[null,"Produce"]')
  assert.equal(state.menus[0].removed, false)
})

test("importing the same file twice gives the state importing it once does", async () => {
  const { once, twice } = await run(
    Effect.gen(function* () {
      yield* importAll(v1File)
      const once = yield* snapshot
      yield* importAll(v1File)
      const twice = yield* snapshot
      return { once, twice }
    }),
  )
  assert.deepStrictEqual(twice, once)
})

// Each `run` is a separate device.
test("an export imports on another device as the same rows", async () => {
  const { exported, exporter } = await run(
    Effect.gen(function* () {
      yield* importAll(v1File)
      yield* writeEvent({
        event: RecipeEvent.tag,
        payload: RecipeEvent.patch("0193c7a0-1b2c-4def-8123-456789abcdef", {
          ingredientScale: 2.5,
        }),
      })
      const exported = Schema.encodeSync(ExportFileJson)(yield* exportAll)
      return { exported, exporter: yield* snapshot }
    }),
  )
  assert.equal(JSON.parse(exported).version, 2)
  assert.equal(exporter.recipes[0].ingredientScale, 2.5)
  const importer = await run(importAll(exported).pipe(Effect.andThen(snapshot)))
  assert.equal(importer.recipes[0].ingredientScale, 2.5)
  assert.deepStrictEqual(importer, exporter)
})

// A `set` replaces the whole row as the newest write, so a re-import that
// wrote rows this device has already seen would bring back deleted ones and
// undo edits made since the export.
test("an import leaves a row deleted or edited here as it is", async () => {
  const { before, after } = await run(
    Effect.gen(function* () {
      yield* importAll(v1File)
      yield* writeEvent({
        event: GroceryItemEvent.tag,
        payload: GroceryItemEvent.remove(groceryItemId),
      })
      yield* writeEvent({
        event: MenuEvent.tag,
        payload: menuUpdate({
          id: menuId,
          name: "Winter favourites",
          days: 5,
          updatedAt: DateTime.makeUnsafe(1_770_000_000_000),
        }),
      })
      const before = yield* snapshot
      yield* importAll(v1File)
      return { before, after: yield* snapshot }
    }),
  )
  assert.deepEqual(before.groceryItems, [])
  assert.deepEqual(
    before.menus.map((row) => row.name),
    ["Winter favourites"],
  )
  assert.deepStrictEqual(after, before)
})

// Export reads this device's tables. Seeds arrive as another device's
// entries a millisecond apart, so they apply in the order listed.

const catalogue = CheffectEvents.groups.flatMap((group) =>
  Object.values(group.events),
)

const seed = (events: ReadonlyArray<EventPayload>) =>
  events.map(({ event, payload }, i) =>
    makeEntry({
      msecs: 1_000 + i,
      event: catalogue.find((e) => e.tag === event)!,
      payload: payload as any,
    }),
  )

const runSeeded = <A, E>(
  entries: ReadonlyArray<EventJournal.Entry>,
  effect: Effect.Effect<A, E, Layer.Success<typeof layerCheffect>>,
) =>
  Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* remote
      .deliver(entries)
      .pipe(
        Effect.andThen(effect),
        Effect.provide(remote.layer.pipe(Layer.provideMerge(layerCheffect))),
      )
  }).pipe(Effect.timeout("10 seconds"), Effect.runPromise)

const otherRecipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-0123456789ab",
)
const otherRecipe = { ...sampleRecipe, id: otherRecipeId }

test("an export leaves out deleted recipes, removed drafts and menus, the API key and chat history", async () => {
  const exported = await runSeeded(
    seed([
      { event: RecipeEvent.tag, payload: RecipeEvent.set(sampleRecipe) },
      { event: RecipeEvent.tag, payload: RecipeEvent.set(otherRecipe) },
      {
        event: RecipeEvent.tag,
        payload: recipeDeleted(otherRecipeId, sampleRecipe.updatedAt),
      },
      {
        event: RecipeEditEvent.tag,
        payload: RecipeEditEvent.set(sampleRecipe),
      },
      {
        event: RecipeEditEvent.tag,
        payload: RecipeEditEvent.remove(sampleRecipe.idString),
      },
      {
        event: MenuEvent.tag,
        payload: MenuEvent.remove(MenuEvent.keyOf({ id: menuId })),
      },
      {
        event: SettingEvent.tag,
        payload: SettingEvent.set({
          id: "openAiApiKey",
          value: '{"_tag":"Some","value":"sk-1"}',
        }),
      },
      {
        event: AiChatTurnEvent.tag,
        payload: AiChatTurnEvent.set({
          id: Schema.decodeSync(AiChatTurnIdFromString)(
            "0193c7a0-1b2c-4def-8123-a2000000000a",
          ),
          prompt: "[]",
          entryTime: 1_000,
        }),
      },
    ]),
    exportAll.pipe(Effect.map(Schema.encodeSync(ExportFileJson))),
  )
  const state = await run(importAll(exported).pipe(Effect.andThen(snapshot)))
  assert.deepEqual(
    state.recipes.map((row) => row.title),
    [sampleRecipe.title],
  )
  assert.deepEqual(state.recipeEdits, [])
  assert.deepEqual(state.menus, [])
  assert.deepEqual(state.settings, [])
  assert.deepEqual(state.aiChatTurns, [])
})

test("a file with one invalid event writes nothing", async () => {
  const parsed = JSON.parse(v1File)
  const last = parsed.events.at(-1)
  const bad = JSON.stringify({
    ...parsed,
    events: [...parsed.events.slice(0, -1), { tag: last.tag, payload: {} }],
  })
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
