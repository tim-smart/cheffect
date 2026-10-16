import { test } from "node:test"
import * as assert from "node:assert/strict"
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { normalizeIngredientName } from "@/domain/GroceryItem"
import { ExportFileJson, importAll } from "@/ExportFile"
import { uuidString } from "@/lib/Id"
import oldExport from "./fixtures/livestore-export.json" with { type: "json" }
import { layerCheffect, snapshot } from "./harness/cheffect"

// The conversion CLI turns an old LiveStore "Export all
// data" file into the new export format. `livestore-export.json` is the
// create events of the old wire fixture, as Effect 3 encoded them, with the
// fixture's placeholder ids swapped for UUIDs as real exports have.

const root = fileURLToPath(new URL("..", import.meta.url))
const script = path.join(root, "scripts/convert-livestore-export.ts")

const convert = async (input: unknown) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cheffect-convert-"))
  const inPath = path.join(dir, "old.json")
  const outPath = path.join(dir, "new.json")
  await fs.writeFile(inPath, JSON.stringify(input))
  const { code, stderr } = await new Promise<{
    readonly code: number
    readonly stderr: string
  }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", script, inPath, outPath],
      { cwd: root },
      (error, _stdout, stderr) =>
        resolve({
          code:
            error === null
              ? 0
              : typeof error.code === "number"
                ? error.code
                : 1,
          stderr,
        }),
    )
  })
  const output = await fs.readFile(outPath, "utf8").catch(() => undefined)
  await fs.rm(dir, { recursive: true })
  return { code, stderr, output }
}

const oldEvent = (name: string) => {
  const event = oldExport.find((event) => event.name === name)
  assert.ok(event, `the sample export has no ${name}`)
  return event.args as Record<string, any>
}

test("converts the sample old export into a file that imports", async () => {
  const { code, stderr, output } = await convert(oldExport)
  assert.equal(code, 0, stderr)
  assert.ok(output !== undefined, "no output file")

  const file = Schema.decodeUnknownSync(ExportFileJson)(output)

  const tags: Record<string, number> = {}
  for (const event of file.events) tags[event.tag] = (tags[event.tag] ?? 0) + 1
  assert.deepEqual(tags, {
    RecipeCreated: 1,
    GroceryItemAdded: 2,
    // Only the item with an aisle teaches one.
    IngredientAisleSet: 1,
    MealPlanAdd: 1,
    MealPlanDayNoteAdd: 1,
    MenuAdd: 1,
    MenuEntryAdd: 1,
    MenuDayNoteAdd: 1,
    AIMemoryEntryAdded: 1,
  })

  const payload = (tag: string) =>
    file.events.find((event) => event.tag === tag)!.payload as any

  // Ids and timestamps pass through, so links and the "created" sort survive.
  const oldRecipe = oldEvent("v1.RecipeCreated")
  const recipe = payload("RecipeCreated")
  assert.equal(uuidString(recipe.id), oldRecipe.id)
  assert.equal(DateTime.toEpochMillis(recipe.createdAt), oldRecipe.createdAt)
  assert.equal(DateTime.toEpochMillis(recipe.updatedAt), oldRecipe.updatedAt)

  const oldItem = oldEvent("v1.GroceryItemAdded")
  const item = file.events
    .filter((event) => event.tag === "GroceryItemAdded")
    .map((event) => event.payload as any)
    .find((item) => uuidString(item.id) === oldItem.id)
  assert.ok(item, "the grocery item kept its id")
  assert.deepEqual(item.recipeIds.map(uuidString), oldItem.recipeIds)
  assert.equal(DateTime.toEpochMillis(item.createdAt), oldItem.createdAt)

  const state = await importAll(output).pipe(
    Effect.andThen(snapshot),
    Effect.timeout("10 seconds"),
    Effect.provide(layerCheffect),
    Effect.runPromise,
  )
  assert.deepEqual(
    state.recipes.map((row) => uuidString(row.id as Uint8Array)),
    [oldRecipe.id],
  )
  assert.equal(state.groceryItems.length, 2)
  assert.deepEqual(
    state.ingredientAisles.map((row) => [row.name, row.aisle, row.deleted]),
    [[normalizeIngredientName(oldItem.name), oldItem.aisle, 0]],
  )
  for (const table of [
    "mealPlan",
    "mealPlanDayNotes",
    "menus",
    "menuEntries",
    "menuDayNotes",
    "aiMemoryEntries",
  ]) {
    assert.equal(state[table].length, 1, table)
  }
})

test("a malformed old export fails on the first bad item and writes no output", async () => {
  // Real exports always carry UUIDs, so an id that isn't one is an error, not
  // something to replace with a fresh id.
  const index = oldExport.findIndex((event) => event.name === "v1.MenuEntryAdd")
  const malformed = oldExport.map((event, i) =>
    i === index
      ? { ...event, args: { ...event.args, recipeId: "recipe-1" } }
      : event,
  )
  const { code, stderr, output } = await convert(malformed)
  assert.notEqual(code, 0)
  assert.match(
    stderr,
    new RegExp(`\\[${index}\\]|item ${index}|index ${index}`),
  )
  assert.equal(output, undefined)
})
