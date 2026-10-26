import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Model from "effect/schema/Model"
import type * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import type * as IndexedDb from "@effect/platform-browser/IndexedDb"
import type { IndexedDbQueryError } from "@effect/platform-browser/IndexedDbQueryBuilder"
import { AiMemoryEntryEvent } from "./AiChat/Events"
import {
  AiMemoryEntry,
  AiMemoryEntryIdFromString,
} from "./domain/AiMemoryEntry"
import { GroceryAisleOrder } from "./domain/GroceryAisleOrder"
import {
  GroceryItem,
  GroceryItemIdFromString,
  StoredGroceryAisle,
} from "./domain/GroceryItem"
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
import {
  GroceryAisleOrderEvent,
  GroceryItemEvent,
  IngredientAisleEvent,
  IngredientAliasEvent,
} from "./Groceries/Events"
import { QueryBuilder } from "./IndexedDb"
import { MealPlanDayNoteEvent, MealPlanEntryEvent } from "./MealPlan/Events"
import { MenuDayNoteEvent, MenuEntryEvent, MenuEvent } from "./Menus/Events"
import { RecipeEditEvent, RecipeEvent } from "./Recipes/Events"
import { SettingEvent } from "./Settings/Events"
import { TimerEvent } from "./Timers/Events"

// Export files
//
// "Export all data" and "Import all data" share one versioned file, with UUIDs
// as canonical strings. Version 2 is a list of rows, each a `set` of its row
// event in the event's JSON codec. Version 1 is a list of the create and set
// events from before rows; files exported then, and the LiveStore conversion
// CLI, still import.

const RecipeIdsFromString = Schema.NullOr(
  Schema.NonEmptyArray(RecipeIdFromString),
)

// Version 1

const exportEvent = <const Tag extends string, S extends Schema.Top>(
  tag: Tag,
  payload: S,
) =>
  Schema.Struct({
    tag: Schema.Literal(tag),
    payload: Schema.toCodecJson(payload),
  })

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
      aisle: Schema.NullOr(StoredGroceryAisle),
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
  exportEvent(
    "SettingsSet",
    Schema.Struct({ id: Schema.String, value: Schema.String }),
  ),
])
export type ExportEvent = typeof ExportEvent.Type

const ExportFileV1 = Schema.Struct({
  format: Schema.Literal("cheffect-export"),
  version: Schema.Literal(1),
  events: Schema.Array(ExportEvent),
})

// Version 2

const exportRow = <const Tag extends string, S extends Schema.Top>(
  tag: Tag,
  row: S,
) =>
  Schema.Struct({
    tag: Schema.Literal(tag),
    row: Schema.toCodecJson(row),
  })

export const ExportRow = Schema.Union([
  exportRow(
    RecipeEvent.tag,
    RecipeEvent.schema.mapFields((fields) => ({
      ...fields,
      id: RecipeIdFromString,
    })),
  ),
  exportRow(
    RecipeEditEvent.tag,
    RecipeEditEvent.schema.mapFields((fields) => ({
      ...fields,
      id: RecipeIdFromString,
    })),
  ),
  exportRow(
    GroceryItemEvent.tag,
    GroceryItemEvent.schema.mapFields((fields) => ({
      ...fields,
      id: GroceryItemIdFromString,
      recipeIds: RecipeIdsFromString,
    })),
  ),
  exportRow(IngredientAisleEvent.tag, IngredientAisleEvent.schema),
  exportRow(GroceryAisleOrderEvent.tag, GroceryAisleOrderEvent.schema),
  exportRow(IngredientAliasEvent.tag, IngredientAliasEvent.schema),
  exportRow(
    MealPlanEntryEvent.tag,
    MealPlanEntryEvent.schema.mapFields((fields) => ({
      ...fields,
      id: MealPlanEntryIdFromString,
      recipeId: RecipeIdFromString,
    })),
  ),
  exportRow(
    MealPlanDayNoteEvent.tag,
    MealPlanDayNoteEvent.schema.mapFields((fields) => ({
      ...fields,
      id: MealPlanDayNoteIdFromString,
    })),
  ),
  exportRow(
    MenuEvent.tag,
    MenuEvent.schema.mapFields((fields) => ({
      ...fields,
      id: MenuIdFromString,
    })),
  ),
  exportRow(
    MenuEntryEvent.tag,
    MenuEntryEvent.schema.mapFields((fields) => ({
      ...fields,
      id: MenuEntryIdFromString,
      menuId: MenuIdFromString,
      recipeId: RecipeIdFromString,
    })),
  ),
  exportRow(
    MenuDayNoteEvent.tag,
    MenuDayNoteEvent.schema.mapFields((fields) => ({
      ...fields,
      id: MenuDayNoteIdFromString,
      menuId: MenuIdFromString,
    })),
  ),
  exportRow(
    AiMemoryEntryEvent.tag,
    AiMemoryEntryEvent.schema.mapFields((fields) => ({
      ...fields,
      id: AiMemoryEntryIdFromString,
    })),
  ),
  exportRow(
    TimerEvent.tag,
    TimerEvent.schema.mapFields((fields) => ({
      ...fields,
      id: TimerIdFromString,
    })),
  ),
  exportRow(SettingEvent.tag, SettingEvent.schema),
])
export type ExportRow = typeof ExportRow.Type

const ExportFileV2 = Schema.Struct({
  format: Schema.Literal("cheffect-export"),
  version: Schema.Literal(2),
  rows: Schema.Array(ExportRow),
})

export const ExportFile = Schema.Union([ExportFileV1, ExportFileV2])
export type ExportFile = typeof ExportFile.Type

export const ExportFileJson = Schema.fromJsonString(ExportFile)

// A version 1 event as the row it creates. A recipe created then had no
// ingredient scale, and an item added without a list is on the default one.
const rowFromEvent = (event: ExportEvent): ExportRow => {
  switch (event.tag) {
    case "RecipeCreated":
      return {
        tag: RecipeEvent.tag,
        row: { ...event.payload, ingredientScale: 1 },
      }
    case "RecipeEditSet":
      return { tag: RecipeEditEvent.tag, row: event.payload }
    case "GroceryItemAdded":
      return {
        tag: GroceryItemEvent.tag,
        row: { ...event.payload, list: event.payload.list ?? null },
      }
    case "IngredientAisleSet":
      return { tag: IngredientAisleEvent.tag, row: event.payload }
    case "GroceryAisleOrderSet":
      return { tag: GroceryAisleOrderEvent.tag, row: event.payload }
    case "MealPlanAdd":
      return { tag: MealPlanEntryEvent.tag, row: event.payload }
    case "MealPlanDayNoteAdd":
      return { tag: MealPlanDayNoteEvent.tag, row: event.payload }
    case "MenuAdd":
      return { tag: MenuEvent.tag, row: event.payload }
    case "MenuEntryAdd":
      return { tag: MenuEntryEvent.tag, row: event.payload }
    case "MenuDayNoteAdd":
      return { tag: MenuDayNoteEvent.tag, row: event.payload }
    case "AIMemoryEntryAdded":
      return { tag: AiMemoryEntryEvent.tag, row: event.payload }
    case "TimerAdded":
      return { tag: TimerEvent.tag, row: event.payload }
    case "SettingsSet":
      return { tag: SettingEvent.tag, row: event.payload }
  }
}

// Export
//
// Read straight from the tables, so an active search can't narrow it and it
// works offline before the remote connects. Leaves out soft-deleted recipes,
// removed menus, chat history, extract jobs and the API key. The sync key and
// server URL live in localStorage and never get here.

const excludedSettings = new Set(["openAiApiKey"])

export const exportAll: Effect.Effect<
  ExportFile,
  IndexedDbQueryError,
  QueryBuilder
> = Effect.gen(function* () {
  const db = yield* QueryBuilder
  const rows: Array<ExportRow> = []
  const add = <Tag extends ExportRow["tag"]>(
    tag: Tag,
    row: Extract<ExportRow, { readonly tag: Tag }>["row"],
  ) => {
    rows.push({ tag, row } as ExportRow)
  }

  for (const row of yield* db.from("recipes").select()) {
    if (row.deletedAt === null) add(RecipeEvent.tag, row)
  }
  for (const row of yield* db.from("recipeEdits").select()) {
    add(RecipeEditEvent.tag, row)
  }
  for (const row of yield* db.from("groceryItems").select()) {
    add(GroceryItemEvent.tag, row)
  }
  for (const row of yield* db.from("ingredientAisles").select()) {
    add(IngredientAisleEvent.tag, row)
  }
  for (const { id: _, ...row } of yield* db
    .from("groceryAisleOrders")
    .select()) {
    add(GroceryAisleOrderEvent.tag, row)
  }
  for (const { id: _, ...row } of yield* db
    .from("ingredientAliases")
    .select()) {
    add(IngredientAliasEvent.tag, row)
  }
  for (const row of yield* db.from("mealPlan").select()) {
    add(MealPlanEntryEvent.tag, row)
  }
  for (const row of yield* db.from("mealPlanDayNotes").select()) {
    add(MealPlanDayNoteEvent.tag, row)
  }
  for (const { removed, ...row } of yield* db.from("menus").select()) {
    if (!removed) add(MenuEvent.tag, row)
  }
  for (const row of yield* db.from("menuEntries").select()) {
    add(MenuEntryEvent.tag, row)
  }
  for (const row of yield* db.from("menuDayNotes").select()) {
    add(MenuDayNoteEvent.tag, row)
  }
  for (const row of yield* db.from("aiMemoryEntries").select()) {
    add(AiMemoryEntryEvent.tag, row)
  }
  for (const row of yield* db.from("timers").select()) {
    add(TimerEvent.tag, row)
  }
  for (const row of yield* db.from("settings").select()) {
    if (!excludedSettings.has(row.id)) add(SettingEvent.tag, row)
  }

  return { format: "cheffect-export", version: 2, rows }
})

// Import
//
// The whole file is decoded before anything is written, so a bad file writes
// nothing. Each row is replayed as an ordinary `set` and syncs like any
// other, with one durability barrier at the end. It merges rather than
// restores:
//
// - A row with a random id that this device has already seen (it has an
//   entry for it in the journal) is skipped. This keeps edits made since,
//   and keeps removed rows removed.
// - Rows with natural keys (drafts, aisles, aisle orders, aliases, settings) are
//   always written, so they overwrite what is here as the newest entries.
//
// A crash part way leaves a partial import, fixed by importing again.

const naturalKeyTags: ReadonlySet<ExportRow["tag"]> = new Set([
  RecipeEditEvent.tag,
  IngredientAisleEvent.tag,
  GroceryAisleOrderEvent.tag,
  IngredientAliasEvent.tag,
  SettingEvent.tag,
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
  const rows = file.version === 1 ? file.events.map(rowFromEvent) : file.rows
  const log = yield* EventLog.EventLog
  const seen = new Set(
    (yield* log.entries).map((entry) =>
      entryKey(entry.event, entry.primaryKey),
    ),
  )
  for (const { tag, row } of rows) {
    const payload = { _tag: "set", row } as const
    if (!naturalKeyTags.has(tag)) {
      const key = entryKey(tag, primaryKeys.get(tag)!(payload))
      if (seen.has(key)) continue
      seen.add(key)
    }
    // Every row is a `set` of its row event, as for `writeEvent`.
    const write: Effect.Effect<unknown, EventJournal.EventJournalError> =
      log.write({ schema: CheffectEvents, event: tag, payload } as any)
    yield* write
  }
  yield* durabilityBarrier
})
