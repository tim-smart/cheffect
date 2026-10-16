import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Model from "effect/schema/Model"
import type * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import type * as IndexedDb from "@effect/platform-browser/IndexedDb"
import type { IndexedDbQueryError } from "@effect/platform-browser/IndexedDbQueryBuilder"
import {
  AiMemoryEntry,
  AiMemoryEntryIdFromString,
} from "./domain/AiMemoryEntry"
import { GroceryAisleOrder } from "./domain/GroceryAisleOrder"
import { GroceryItem, GroceryItemIdFromString } from "./domain/GroceryItem"
import { IngredientAisle } from "./domain/IngredientAisle"
import {
  MealPlanDayNote,
  MealPlanDayNoteIdFromString,
} from "./domain/MealPlanDayNote"
import { MealPlanEntryIdFromString } from "./domain/MealPlanEntry"
import { Menu, MenuIdFromString } from "./domain/Menu"
import { MenuDayNote, MenuDayNoteIdFromString } from "./domain/MenuDayNote"
import { MenuEntry, MenuEntryIdFromString } from "./domain/MenuEntry"
import { Recipe, RecipeEdit, RecipeIdFromString } from "./domain/Recipe"
import { Timer, TimerIdFromString } from "./domain/Timer"
import { CheffectEvents, durabilityBarrier } from "./EventLog"
import { QueryBuilder } from "./IndexedDb"
import { eventFields } from "./lib/eventFields"
import { isLive } from "./lib/Lww"
import { SettingsEvents } from "./Settings/Events"

// Export files (TIM-256)
//
// "Export all data", "Import all data" and the LiveStore conversion CLI share
// one versioned file: a list of create and set events from the catalogue,
// each payload in its event's JSON codec with UUIDs as canonical strings.

const exportEvent = <const Tag extends string, S extends Schema.Top>(
  tag: Tag,
  payload: S,
) =>
  Schema.Struct({
    tag: Schema.Literal(tag),
    payload: Schema.toCodecJson(payload),
  })

const RecipeIdsFromString = Schema.NullOr(
  Schema.NonEmptyArray(RecipeIdFromString),
)

export const ExportEvent = Schema.Union([
  exportEvent(
    "RecipeCreated",
    Recipe.insert.mapFields((fields) => ({
      ...fields,
      id: RecipeIdFromString,
    })),
  ),
  exportEvent(
    "RecipeEditSet",
    RecipeEdit.mapFields((fields) => ({ ...fields, id: RecipeIdFromString })),
  ),
  exportEvent(
    "GroceryItemAdded",
    GroceryItem.insert.mapFields((fields) => ({
      ...fields,
      id: GroceryItemIdFromString,
      recipeIds: RecipeIdsFromString,
    })),
  ),
  exportEvent("IngredientAisleSet", IngredientAisle),
  exportEvent("GroceryAisleOrderSet", GroceryAisleOrder),
  exportEvent(
    "MealPlanAdd",
    Schema.Struct({
      id: MealPlanEntryIdFromString,
      recipeId: RecipeIdFromString,
      day: Model.Date,
    }),
  ),
  exportEvent(
    "MealPlanDayNoteAdd",
    MealPlanDayNote.insert.mapFields((fields) => ({
      ...fields,
      id: MealPlanDayNoteIdFromString,
    })),
  ),
  exportEvent(
    "MenuAdd",
    Menu.insert.mapFields((fields) => ({ ...fields, id: MenuIdFromString })),
  ),
  exportEvent(
    "MenuEntryAdd",
    MenuEntry.insert.mapFields((fields) => ({
      ...fields,
      id: MenuEntryIdFromString,
      menuId: MenuIdFromString,
      recipeId: RecipeIdFromString,
    })),
  ),
  exportEvent(
    "MenuDayNoteAdd",
    MenuDayNote.insert.mapFields((fields) => ({
      ...fields,
      id: MenuDayNoteIdFromString,
      menuId: MenuIdFromString,
    })),
  ),
  exportEvent(
    "AIMemoryEntryAdded",
    AiMemoryEntry.insert.mapFields((fields) => ({
      ...fields,
      id: AiMemoryEntryIdFromString,
    })),
  ),
  exportEvent(
    "TimerAdded",
    Timer.insert.mapFields((fields) => ({ ...fields, id: TimerIdFromString })),
  ),
  exportEvent("SettingsSet", SettingsEvents.events.SettingsSet.payload),
])
export type ExportEvent = typeof ExportEvent.Type

export const ExportFile = Schema.Struct({
  format: Schema.Literal("cheffect-export"),
  version: Schema.Literal(1),
  events: Schema.Array(ExportEvent),
})
export type ExportFile = typeof ExportFile.Type

export const ExportFileJson = Schema.fromJsonString(ExportFile)

// Export
//
// Read straight from the tables, so an active search can't narrow it and it
// works offline before the remote connects. Leaves out soft-deleted recipes,
// tombstones, chat history, extract jobs and the API key. The sync key and
// server URL live in localStorage and never get here.

const excludedSettings = new Set(["openAiApiKey"])

export const exportAll: Effect.Effect<
  ExportFile,
  IndexedDbQueryError,
  QueryBuilder
> = Effect.gen(function* () {
  const db = yield* QueryBuilder
  const events: Array<ExportEvent> = []
  const add = <Tag extends ExportEvent["tag"]>(
    tag: Tag,
    payload: Extract<ExportEvent, { readonly tag: Tag }>["payload"],
  ) => {
    events.push({ tag, payload } as ExportEvent)
  }

  const recipeFields = eventFields(Recipe.insert)
  for (const row of yield* db.from("recipes").select()) {
    if (row.deletedAt === null) add("RecipeCreated", recipeFields(row))
  }
  const editFields = eventFields(RecipeEdit)
  for (const row of yield* db.from("recipeEdits").select()) {
    if (isLive(row)) add("RecipeEditSet", editFields(row))
  }
  const itemFields = eventFields(GroceryItem.insert)
  for (const row of yield* db.from("groceryItems").select()) {
    add("GroceryItemAdded", itemFields(row))
  }
  for (const row of yield* db.from("ingredientAisles").select()) {
    if (isLive(row)) {
      add("IngredientAisleSet", { name: row.name, aisle: row.aisle })
    }
  }
  const orderFields = eventFields(GroceryAisleOrder)
  for (const row of yield* db.from("groceryAisleOrders").select()) {
    if (isLive(row)) add("GroceryAisleOrderSet", orderFields(row))
  }
  for (const row of yield* db.from("mealPlan").select()) {
    add("MealPlanAdd", { id: row.id, recipeId: row.recipeId, day: row.day })
  }
  const mealPlanNoteFields = eventFields(MealPlanDayNote.insert)
  for (const row of yield* db.from("mealPlanDayNotes").select()) {
    add("MealPlanDayNoteAdd", mealPlanNoteFields(row))
  }
  const menuFields = eventFields(Menu.insert)
  for (const row of yield* db.from("menus").select()) {
    add("MenuAdd", menuFields(row))
  }
  const menuEntryFields = eventFields(MenuEntry.insert)
  for (const row of yield* db.from("menuEntries").select()) {
    add("MenuEntryAdd", menuEntryFields(row))
  }
  const menuNoteFields = eventFields(MenuDayNote.insert)
  for (const row of yield* db.from("menuDayNotes").select()) {
    add("MenuDayNoteAdd", menuNoteFields(row))
  }
  const memoryFields = eventFields(AiMemoryEntry.insert)
  for (const row of yield* db.from("aiMemoryEntries").select()) {
    add("AIMemoryEntryAdded", memoryFields(row))
  }
  const timerFields = eventFields(Timer.insert)
  for (const row of yield* db.from("timers").select()) {
    add("TimerAdded", timerFields(row))
  }
  for (const row of yield* db.from("settings").select()) {
    if (!excludedSettings.has(row.id)) {
      add("SettingsSet", { id: row.id, value: row.value })
    }
  }

  return { format: "cheffect-export", version: 1, events }
})

// Import
//
// The whole file is decoded before anything is written, so a bad file writes
// nothing. Events are replayed as ordinary writes and sync like any other,
// with one durability barrier at the end. It merges rather than restores:
//
// - A create this device has already seen (its entry is in the journal) is
//   skipped. Handlers already ignore a create for a row that exists, and this
//   also keeps hard-deleted rows deleted, which a handler can't tell apart
//   from rows it has never had (TIM-248 rule 4).
// - Sets on natural keys (drafts, aisles, aisle orders, settings) are always
//   written, so they overwrite what is here as the newest entries.
//
// A crash part way leaves a partial import, fixed by importing again.

const naturalKeyTags: ReadonlySet<ExportEvent["tag"]> = new Set([
  "RecipeEditSet",
  "IngredientAisleSet",
  "GroceryAisleOrderSet",
  "SettingsSet",
])

const primaryKeys = new Map(
  CheffectEvents.groups.flatMap((group) =>
    Object.values(group.events).map(
      (event) =>
        [event.tag, event.primaryKey as (payload: any) => string] as const,
    ),
  ),
)

const entryKey = (tag: string, primaryKey: string) =>
  `${tag}\u0000${primaryKey}`

export const importAll = Effect.fnUntraced(function* (
  text: string,
): Effect.fn.Return<
  void,
  Schema.SchemaError | EventJournal.EventJournalError | IndexedDbQueryError,
  EventLog.EventLog | QueryBuilder | IndexedDb.IndexedDb
> {
  const file = yield* Schema.decodeEffect(ExportFileJson)(text)
  const log = yield* EventLog.EventLog
  const seen = new Set(
    (yield* log.entries).map((entry) =>
      entryKey(entry.event, entry.primaryKey),
    ),
  )
  for (const { tag, payload } of file.events) {
    if (!naturalKeyTags.has(tag)) {
      const key = entryKey(tag, primaryKeys.get(tag)!(payload))
      if (seen.has(key)) continue
      seen.add(key)
    }
    // The file's events are a subset of the catalogue's, as for `writeEvent`.
    const write: Effect.Effect<unknown, EventJournal.EventJournalError> =
      log.write({ schema: CheffectEvents, event: tag, payload } as any)
    yield* write
  }
  yield* durabilityBarrier
})
