import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as EventJournal from "effect/eventlog/EventJournal"
import { AiChatTurnEvent, AiMemoryEntryEvent } from "@/AiChat/Events"
import { CheffectEvents, type EventPayload, writeEvent } from "@/EventLog"
import { ExportFileJson, exportAll, importAll } from "@/ExportFile"
import {
  GroceryAisleOrderEvent,
  GroceryItemEvent,
  IngredientAisleEvent,
} from "@/Groceries/Events"
import { MealPlanDayNoteEvent, MealPlanEntryEvent } from "@/MealPlan/Events"
import {
  MenuDayNoteEvent,
  MenuEntryEvent,
  MenuEvent,
  menuUpdate,
} from "@/Menus/Events"
import { RecipeEditEvent, RecipeEvent, recipeDeleted } from "@/Recipes/Events"
import { SettingEvent } from "@/Settings/Events"
import { TimerEvent } from "@/Timers/Events"
import { AiChatTurnIdFromString } from "@/domain/AiChatTurn"
import { GroceryItemIdFromString } from "@/domain/GroceryItem"
import { MenuIdFromString } from "@/domain/Menu"
import { RecipeIdFromString } from "@/domain/Recipe"
import { sampleRecipe } from "./fixtures/event-samples"
import { exported, journalEntries, layerCheffect } from "./harness/cheffect"
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

// One row of each kind the version 1 file has an event for.
const v1Kinds = [
  RecipeEvent.tag,
  RecipeEditEvent.tag,
  GroceryItemEvent.tag,
  IngredientAisleEvent.tag,
  GroceryAisleOrderEvent.tag,
  MealPlanEntryEvent.tag,
  MealPlanDayNoteEvent.tag,
  MenuEvent.tag,
  MenuEntryEvent.tag,
  MenuDayNoteEvent.tag,
  AiMemoryEntryEvent.tag,
  TimerEvent.tag,
  SettingEvent.tag,
]

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)
const groceryItemId = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000001",
)
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
  const rows = await run(importAll(v1File).pipe(Effect.andThen(exported)))
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(rows).map(([kind, of]) => [kind, of.length]),
    ),
    Object.fromEntries(v1Kinds.map((kind) => [kind, 1])),
  )
  // A recipe created then had no ingredient scale, and an item added
  // without a list is on the default one.
  assert.equal(rows[RecipeEvent.tag][0].ingredientScale, 1)
  assert.equal(rows[GroceryItemEvent.tag][0].list, null)
  assert.deepEqual(rows[IngredientAisleEvent.tag], [
    { name: "carrots", aisle: "Produce" },
  ])
})

// Each `run` is a separate device.
test("an export imports on another device as the same rows", async () => {
  const { file, exporter } = await run(
    Effect.gen(function* () {
      yield* importAll(v1File)
      yield* writeEvent(
        RecipeEvent.patch(
          { id: recipeId },
          {
            ingredientScale: 2.5,
          },
        ),
      )
      const file = Schema.encodeSync(ExportFileJson)(yield* exportAll)
      return { file, exporter: yield* exported }
    }),
  )
  assert.equal(exporter[RecipeEvent.tag][0].ingredientScale, 2.5)
  const importer = await run(importAll(file).pipe(Effect.andThen(exported)))
  assert.deepStrictEqual(importer, exporter)
})

// A `set` replaces the whole row as the newest write, so a re-import that
// wrote rows this device has already seen would bring back deleted ones and
// undo edits made since the export.
test("an import leaves a row deleted or edited here as it is", async () => {
  const { before, after } = await run(
    Effect.gen(function* () {
      yield* importAll(v1File)
      yield* writeEvent(GroceryItemEvent.remove({ id: groceryItemId }))
      yield* writeEvent(
        menuUpdate({
          id: menuId,
          name: "Winter favourites",
          days: 5,
          updatedAt: DateTime.makeUnsafe(1_770_000_000_000),
        }),
      )
      const before = yield* exported
      yield* importAll(v1File)
      return { before, after: yield* exported }
    }),
  )
  assert.equal(before[GroceryItemEvent.tag], undefined)
  assert.deepEqual(
    before[MenuEvent.tag].map((row) => row.name),
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
  const rows = await runSeeded(
    seed([
      RecipeEvent.set(sampleRecipe),
      RecipeEvent.set(otherRecipe),
      recipeDeleted(otherRecipeId, sampleRecipe.updatedAt),
      RecipeEditEvent.set(sampleRecipe),
      RecipeEditEvent.remove({ id: sampleRecipe.id }),
      MenuEvent.remove({ id: menuId }),
      SettingEvent.set({
        id: "openAiApiKey",
        value: '{"_tag":"Some","value":"sk-1"}',
      }),
      AiChatTurnEvent.set({
        id: Schema.decodeSync(AiChatTurnIdFromString)(
          "0193c7a0-1b2c-4def-8123-a2000000000a",
        ),
        prompt: "[]",
        entryTime: 1_000,
      }),
    ]),
    exported,
  )
  assert.deepEqual(
    Object.keys(rows).map((kind) => [kind, rows[kind].length]),
    [[RecipeEvent.tag, 1]],
  )
  assert.equal(rows[RecipeEvent.tag][0].title, sampleRecipe.title)
})

test("a file with one invalid event writes nothing", async () => {
  const parsed = JSON.parse(v1File)
  const last = parsed.events.at(-1)
  const bad = JSON.stringify({
    ...parsed,
    events: [...parsed.events.slice(0, -1), { tag: last.tag, payload: {} }],
  })
  const { exit, entries, rows } = await run(
    Effect.gen(function* () {
      const exit = yield* Effect.exit(importAll(bad))
      const entries = yield* journalEntries
      return { exit, entries, rows: yield* exported }
    }),
  )
  assert.ok(Exit.isFailure(exit), "the import should fail")
  assert.equal(entries.length, 0)
  assert.deepEqual(rows, {})
})
