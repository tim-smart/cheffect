import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import { CheffectEvents, type EventPayload } from "@/EventLog"
import { AiChatTurnIdFromString } from "@/domain/AiChatTurn"
import { GroceryItem, GroceryItemIdFromString } from "@/domain/GroceryItem"
import { MenuIdFromString } from "@/domain/Menu"
import { Recipe } from "@/domain/Recipe"
import { eventSamples } from "./fixtures/event-samples"
import { layerCheffect, snapshot } from "./harness/cheffect"
import { makeEntry, makeFakeRemote } from "./harness/eventlog"

// Compaction runs over each batch of remote entries before the handlers do.
// It may skip an entry only when the batch makes it irrelevant: a newer entry
// for the same row writes every field it writes, or a hard delete of the row
// follows it. The journal still stores every entry; only the replay shrinks.
//
// Single-entry batches leave nothing to compact, so delivering entries one
// at a time is the uncompacted replay every compacted one must match.

const catalogue = CheffectEvents.groups.flatMap((group) =>
  Object.values(group.events),
)

type Payload<Tag extends EventPayload["event"]> = Extract<
  EventPayload,
  { readonly event: Tag }
>["payload"]

const sample = <Tag extends EventPayload["event"]>(event: Tag): Payload<Tag> =>
  eventSamples.find((sample) => sample.event === event)!.payload as Payload<Tag>

const at = <Tag extends EventPayload["event"]>(
  msecs: number,
  event: Tag,
  payload: Payload<Tag>,
): EventJournal.Entry =>
  makeEntry({
    msecs,
    event: catalogue.find((e) => e.tag === event)!,
    payload: payload as any,
  })

const describe = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry) => `${entry.event}@${entry.createdAtMillis}`)

// What the EventLog replays from one remote batch: entries without a
// compactor as they are, the rest as their group's compactor writes them.
const compactBatch = (entries: ReadonlyArray<EventJournal.Entry>) =>
  EventLog.Registry.use((registry) =>
    Effect.gen(function* () {
      const replayed: Array<EventJournal.Entry> = []
      const byCompactor = new Map<
        NonNullable<ReturnType<typeof registry.compactors.get>>,
        Array<EventJournal.Entry>
      >()
      for (const entry of entries) {
        const compactor = registry.compactors.get(entry.event)
        if (compactor === undefined) {
          replayed.push(entry)
          continue
        }
        const group = byCompactor.get(compactor) ?? []
        group.push(entry)
        byCompactor.set(compactor, group)
      }
      for (const [compactor, group] of byCompactor) {
        yield* compactor.effect({
          entries: group,
          write: (entry) => Effect.sync(() => void replayed.push(entry)),
        })
      }
      return replayed.sort(EventJournal.Entry.Order)
    }),
  )

// Each call is a fresh device that receives `batches` in order, then reads.
const receive = <A, E>(
  batches: ReadonlyArray<ReadonlyArray<EventJournal.Entry>>,
  read: Effect.Effect<A, E, Layer.Success<typeof layerCheffect>>,
) =>
  Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.forEach(batches, remote.deliver, {
      discard: true,
    }).pipe(
      Effect.andThen(read),
      Effect.provide(remote.layer.pipe(Layer.provideMerge(layerCheffect))),
    )
  }).pipe(Effect.timeout("10 seconds"), Effect.runPromise)

const oneAtATime = (
  batches: ReadonlyArray<ReadonlyArray<EventJournal.Entry>>,
) => batches.flat().map((entry) => [entry])

const recipe = sample("RecipeCreated")
const recipeUpdate = (title: string) =>
  Recipe.update.make({ ...sample("RecipeUpdated"), title })
const recipeEdit = sample("RecipeEditSet")
const timer = sample("TimerAdded")
const mealPlanEntry = sample("MealPlanAdd")
const mealPlanNote = sample("MealPlanDayNoteAdd")
const menu = sample("MenuAdd")
const menuEntry = sample("MenuEntryAdd")
const item = sample("GroceryItemAdded")
const otherItem = {
  ...item,
  id: Schema.decodeSync(GroceryItemIdFromString)(
    "0193c7a0-1b2c-4def-8123-c0ffee000002",
  ),
}
const turn = sample("AiChatTurnAdded")
const otherTurn = {
  ...turn,
  id: Schema.decodeSync(AiChatTurnIdFromString)(
    "0193c7a0-1b2c-4def-8123-a2000000000b",
  ),
}

test("a batch replays fewer entries to the same state, and compacting again keeps them all", async () => {
  const history = [
    // Recipes: a newer update rewrites every field the older update and the
    // scale change wrote. A newer draft replaces the older one, and the
    // draft's remove stays.
    at(1000, "RecipeCreated", recipe),
    at(1100, "RecipeUpdated", recipeUpdate("Carrot soup v2")),
    at(1200, "RecipeSetIngredientScale", sample("RecipeSetIngredientScale")),
    at(1300, "RecipeUpdated", recipeUpdate("Carrot soup v3")),
    at(1400, "RecipeDeleted", sample("RecipeDeleted")),
    at(1500, "RecipeEditSet", { ...recipeEdit, title: "Draft 1" }),
    at(1600, "RecipeEditSet", { ...recipeEdit, title: "Draft 2" }),
    at(1700, "RecipeEditRemove", sample("RecipeEditRemove")),
    // Settings: the newer value replaces the older.
    at(2000, "SettingsSet", {
      ...sample("SettingsSet"),
      value: sample("SettingsSet").value.replace("NZ", "AU"),
    }),
    at(2100, "SettingsSet", sample("SettingsSet")),
    // Timers: everything before the dismiss is gone with the row.
    at(3000, "TimerAdded", timer),
    at(3100, "TimerUpdated", sample("TimerUpdated")),
    at(3200, "TimerUpdated", sample("TimerUpdated")),
    at(3300, "TimerDeleted", sample("TimerDeleted")),
    // Meal plan: the last day wins; the note is removed.
    at(4000, "MealPlanAdd", mealPlanEntry),
    at(4100, "MealPlanSetDay", sample("MealPlanSetDay")),
    at(4200, "MealPlanSetDay", {
      ...sample("MealPlanSetDay"),
      day: mealPlanEntry.day,
    }),
    at(4300, "MealPlanDayNoteAdd", mealPlanNote),
    at(4400, "MealPlanDayNoteUpdate", sample("MealPlanDayNoteUpdate")),
    at(4500, "MealPlanDayNoteRemove", sample("MealPlanDayNoteRemove")),
    // Menus: the last rename and the last day move win.
    at(5000, "MenuAdd", menu),
    at(5100, "MenuEntryAdd", menuEntry),
    at(5200, "MenuEntrySetDay", sample("MenuEntrySetDay")),
    at(5300, "MenuEntrySetDay", { ...sample("MenuEntrySetDay"), day: 4 }),
    at(5400, "MenuUpdate", sample("MenuUpdate")),
    at(5500, "MenuUpdate", { ...sample("MenuUpdate"), name: "Summer" }),
    // Groceries: the update rewrites the first toggle's field but not the
    // second's. The cleared item replays only the clear. The newer aisle and
    // aisle order replace the older ones.
    at(6000, "GroceryItemAdded", item),
    at(6100, "GroceryItemToggled", { id: item.id, completed: true }),
    at(6200, "GroceryItemUpdated", sample("GroceryItemUpdated")),
    at(6300, "GroceryItemToggled", { id: item.id, completed: false }),
    at(6400, "GroceryItemAdded", otherItem),
    at(6500, "GroceryItemToggled", { id: otherItem.id, completed: true }),
    at(6600, "GroceryItemsDeleted", { ids: [otherItem.id] }),
    at(6700, "IngredientAisleSet", { name: "carrots", aisle: "Pantry" }),
    at(6800, "IngredientAisleSet", sample("IngredientAisleSet")),
    at(6900, "GroceryAisleOrderSet", {
      ...sample("GroceryAisleOrderSet"),
      sortOrder: 1,
    }),
    at(7000, "GroceryAisleOrderSet", sample("GroceryAisleOrderSet")),
    // AI chat: a cleared turn replays only the clear.
    at(8000, "AiChatTurnAdded", turn),
    at(8100, "AiChatTurnAdded", otherTurn),
    at(8200, "AiChatTurnsRemoved", { ids: [turn.id] }),
    at(8300, "AIMemoryEntryAdded", sample("AIMemoryEntryAdded")),
  ]

  const { replayed, again, compacted } = await receive(
    [history],
    Effect.gen(function* () {
      const replayed = yield* compactBatch(history)
      const again = yield* compactBatch(replayed)
      return { replayed, again, compacted: yield* snapshot }
    }),
  )

  assert.deepEqual(describe(replayed), [
    "RecipeCreated@1000",
    "RecipeUpdated@1300",
    "RecipeDeleted@1400",
    "RecipeEditSet@1600",
    "RecipeEditRemove@1700",
    "SettingsSet@2100",
    "TimerDeleted@3300",
    "MealPlanAdd@4000",
    "MealPlanSetDay@4200",
    "MealPlanDayNoteRemove@4500",
    "MenuAdd@5000",
    "MenuEntryAdd@5100",
    "MenuEntrySetDay@5300",
    "MenuUpdate@5500",
    "GroceryItemAdded@6000",
    "GroceryItemUpdated@6200",
    "GroceryItemToggled@6300",
    "GroceryItemsDeleted@6600",
    "IngredientAisleSet@6800",
    "GroceryAisleOrderSet@7000",
    "AiChatTurnAdded@8100",
    "AiChatTurnsRemoved@8200",
    "AIMemoryEntryAdded@8300",
  ])
  // Kept entries pass through unchanged, ids included.
  const byId = new Map(history.map((entry) => [entry.idString, entry]))
  assert.deepStrictEqual(
    replayed,
    replayed.map((entry) => byId.get(entry.idString)),
  )
  assert.deepEqual(describe(again), describe(replayed))

  const uncompacted = await receive(oneAtATime([history]), snapshot)
  assert.deepStrictEqual(compacted, uncompacted)
})

// Last-writer-wins compares each field's stamp, the id of the entry that wrote
// it, so compaction must leave the surviving entries' ids alone. A peer's
// write that arrived earlier sits between the batch's entries in time, and a
// stale write arrives after the batch.
//
// A day note that existed before the batch moves to a menu that is then
// removed: the cascade finds it through its new `menuId`, so the Add that
// moved it matters even though a later Add rewrites every field.
test("concurrent and stale peer writes merge with a compacted batch as they would without it", async () => {
  const aisle = sample("IngredientAisleSet")
  const note = sample("MenuDayNoteAdd")
  const otherMenuId = Schema.decodeSync(MenuIdFromString)(
    "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f9",
  )
  const batches = [
    [
      at(1000, "RecipeCreated", recipe),
      at(2500, "RecipeUpdated", recipeUpdate("Peer")),
      at(6000, "MenuDayNoteAdd", { ...note, menuId: otherMenuId }),
      at(6900, "MenuDayNoteUpdate", {
        id: note.id,
        day: note.day,
        note: "Peer",
        updatedAt: note.updatedAt,
      }),
    ],
    [
      at(2000, "RecipeUpdated", recipeUpdate("Older")),
      at(3000, "RecipeUpdated", recipeUpdate("Newest")),
      at(4000, "GroceryItemAdded", item),
      at(4100, "GroceryItemToggled", { id: item.id, completed: true }),
      at(4200, "GroceryItemDeleted", { id: item.id }),
      at(5000, "IngredientAisleSet", aisle),
      at(5100, "IngredientAisleRemoved", { name: aisle.name }),
      at(6100, "MenuDayNoteAdd", note),
      at(6200, "MenuRemove", { id: note.menuId }),
      at(6300, "MenuDayNoteAdd", { ...note, note: "Re-added" }),
    ],
    [
      at(2900, "RecipeUpdated", recipeUpdate("Stale")),
      at(4150, "GroceryItemUpdated", sample("GroceryItemUpdated")),
      at(5050, "IngredientAisleSet", { ...aisle, aisle: "Pantry" }),
    ],
  ]

  const compacted = await receive(batches, snapshot)
  const uncompacted = await receive(oneAtATime(batches), snapshot)

  assert.deepStrictEqual(compacted, uncompacted)
  assert.equal(compacted.recipes[0].title, "Newest")
  assert.deepEqual(compacted.groceryItems, [])
  assert.equal(compacted.ingredientAisles[0].deleted, 1)
  assert.equal(compacted.menuDayNotes[0].note, "Re-added")
})

// A remote batch replays in delivery order, which need not be id order: a
// device that was offline uploads its older entries after newer ones. Here
// the newest update arrives before the add and finds no row, so the older
// update that runs after the add is the one that sticks.
test("a batch out of id order replays as its entries would one at a time", async () => {
  const update = (name: string) =>
    GroceryItem.update.make({ ...sample("GroceryItemUpdated"), name })
  const batch = [
    at(1200, "GroceryItemUpdated", update("Newest")),
    at(1000, "GroceryItemAdded", { ...item, name: "Original" }),
    at(1100, "GroceryItemUpdated", update("Older")),
  ]

  const compacted = await receive([batch], snapshot)
  const uncompacted = await receive(oneAtATime([batch]), snapshot)

  assert.equal(uncompacted.groceryItems[0].name, "Older")
  assert.deepStrictEqual(compacted, uncompacted)
})
