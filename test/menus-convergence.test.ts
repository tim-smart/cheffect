import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { CheffectEvents } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MenusLayer } from "@/Menus"
import { MenuEvents } from "@/Menus/Events"
import { Menu, MenuIdFromString } from "@/domain/Menu"
import { MenuDayNote, MenuDayNoteIdFromString } from "@/domain/MenuDayNote"
import { MenuEntry, MenuEntryIdFromString } from "@/domain/MenuEntry"
import { RecipeIdFromString } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  type Row,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Menus handlers converge whatever order remote entries arrive in
// (TIM-248): adds create, `MenuUpdate`, `MenuEntrySetDay` and note updates
// patch under last-writer-wins and do nothing when the row is missing, and
// removes hard-delete, so a late update can't bring a row back. A day note
// add on an existing row merges under last-writer-wins.
//
// The menu cascades are the one place a handler writes beyond its own row:
// `MenuRemove` deletes the menu's entries and notes, and a `MenuUpdate` that
// shrinks `days` deletes the entries and notes on the days it drops. Menu
// days are numbered from 1, so shrinking to 5 days keeps day 5.
//
// The first add of a row is delivered before the permuted entries: nothing
// can move or remove a row its device hasn't received. No recipe is ever
// delivered, because handlers only touch their own tables.

const {
  MenuAdd,
  MenuUpdate,
  MenuRemove,
  MenuEntryAdd,
  MenuEntrySetDay,
  MenuEntryRemove,
  MenuDayNoteAdd,
  MenuDayNoteUpdate,
  MenuDayNoteRemove,
} = MenuEvents.events

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)

const winterIdString = "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f6"
const winter = Schema.decodeSync(MenuIdFromString)(winterIdString)
const summer = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f0",
)
type MenuId = typeof winter

const soupIdString = "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f7"
const soup = Schema.decodeSync(MenuEntryIdFromString)(soupIdString)
const stew = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e1",
)
const salad = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e2",
)
const pie = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e3",
)
type EntryId = typeof soup

const firstNoteIdString = "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f8"
const firstNote = Schema.decodeSync(MenuDayNoteIdFromString)(firstNoteIdString)
const secondNote = Schema.decodeSync(MenuDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5d1",
)
const lateNote = Schema.decodeSync(MenuDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5d2",
)
type NoteId = typeof firstNote

const menuAdded = (id: MenuId, name: string) =>
  makeEntry({
    msecs: 1000,
    event: MenuAdd,
    payload: Menu.insert.make({
      id,
      name,
      days: 7,
      createdAt: DateTime.makeUnsafe(1000),
      updatedAt: DateTime.makeUnsafe(1000),
    }),
  })

const menuUpdated = (
  msecs: number,
  id: MenuId,
  fields: { readonly name: string; readonly days: number },
) =>
  makeEntry({
    msecs,
    event: MenuUpdate,
    payload: Menu.update.make({
      id,
      ...fields,
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const menuRemoved = (msecs: number, id: MenuId) =>
  makeEntry({ msecs, event: MenuRemove, payload: { id } })

const added = (msecs: number, id: EntryId, menuId: MenuId, day: number) =>
  makeEntry({
    msecs,
    event: MenuEntryAdd,
    payload: MenuEntry.insert.make({
      id,
      menuId,
      recipeId,
      day,
      createdAt: DateTime.makeUnsafe(msecs),
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const moved = (msecs: number, id: EntryId, day: number) =>
  makeEntry({
    msecs,
    event: MenuEntrySetDay,
    payload: { id, day, updatedAt: DateTime.makeUnsafe(msecs) },
  })

const removed = (msecs: number, id: EntryId) =>
  makeEntry({ msecs, event: MenuEntryRemove, payload: { id } })

const noteAdded = (
  msecs: number,
  id: NoteId,
  menuId: MenuId,
  day: number,
  note: string,
) =>
  makeEntry({
    msecs,
    event: MenuDayNoteAdd,
    payload: MenuDayNote.insert.make({
      id,
      menuId,
      day,
      note,
      createdAt: DateTime.makeUnsafe(msecs),
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const noteUpdated = (msecs: number, id: NoteId, day: number, note: string) =>
  makeEntry({
    msecs,
    event: MenuDayNoteUpdate,
    payload: MenuDayNote.update.make({
      id,
      day,
      note,
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const noteRemoved = (msecs: number, id: NoteId) =>
  makeEntry({ msecs, event: MenuDayNoteRemove, payload: { id } })

const makeLayer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(EventLog.schema(MenuEvents), MenusLayer).pipe(
    Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
  )
  return Layer.mergeAll(eventLog, remote.pipe(Layer.provide(eventLog))).pipe(
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
}

const read = Effect.gen(function* () {
  return {
    menus: yield* readTable("menus"),
    menuEntries: yield* readTable("menuEntries"),
    menuDayNotes: yield* readTable("menuDayNotes"),
  }
})

// Ids are stored as UUID bytes; compare and sort them by the string form.
const idOf = (row: Row) => uuidString(row.id as Uint8Array)
const byId = (rows: ReadonlyArray<Row>) =>
  rows.slice().sort((a, b) => idOf(a).localeCompare(idOf(b)))

test("the Menus group is in the catalogue, keyed by the canonical id string", () => {
  assert.ok(
    (CheffectEvents.groups as ReadonlyArray<unknown>).includes(MenuEvents),
  )
  // `MenuDayRemove` was never emitted and is dropped.
  assert.deepEqual(Object.keys(MenuEvents.events).sort(), [
    "MenuAdd",
    "MenuDayNoteAdd",
    "MenuDayNoteRemove",
    "MenuDayNoteUpdate",
    "MenuEntryAdd",
    "MenuEntryRemove",
    "MenuEntrySetDay",
    "MenuRemove",
    "MenuUpdate",
  ])
  const keyedBy = (
    idString: string,
    entries: ReadonlyArray<EventJournal.Entry>,
  ) => {
    for (const entry of entries) {
      assert.equal(entry.primaryKey, idString, entry.event)
    }
  }
  keyedBy(winterIdString, [
    menuAdded(winter, "Winter warmers"),
    menuUpdated(2000, winter, { name: "Winter", days: 5 }),
    menuRemoved(2000, winter),
  ])
  keyedBy(soupIdString, [
    added(1000, soup, winter, 1),
    moved(2000, soup, 2),
    removed(2000, soup),
  ])
  keyedBy(firstNoteIdString, [
    noteAdded(1000, firstNote, winter, 1, "Leftovers"),
    noteUpdated(2000, firstNote, 1, "Pizza"),
    noteRemoved(2000, firstNote),
  ])
})

test("the newest rename of a menu wins, and other menus are untouched", async () => {
  const { menus } = await converge({
    layer: makeLayer,
    read,
    setup: [menuAdded(winter, "Winter warmers"), menuAdded(summer, "Summer")],
    concurrent: [
      menuUpdated(2000, winter, { name: "Winter", days: 7 }),
      menuUpdated(3000, winter, { name: "Winter favourites", days: 7 }),
      menuUpdated(2500, winter, { name: "Cold nights", days: 7 }),
    ],
  })
  assert.deepEqual(
    byId(menus).map((row) => pick(row, ["id", "name", "days", "updatedAt"])),
    [
      { id: summer, name: "Summer", days: 7, updatedAt: 1000 },
      { id: winter, name: "Winter favourites", days: 7, updatedAt: 3000 },
    ],
  )
})

test("the newest move of a menu entry wins, and other entries are untouched", async () => {
  const { menuEntries } = await converge({
    layer: makeLayer,
    read,
    setup: [
      menuAdded(winter, "Winter warmers"),
      added(1000, soup, winter, 1),
      added(1000, stew, winter, 1),
    ],
    concurrent: [
      moved(2000, soup, 2),
      moved(3000, soup, 4),
      moved(2500, soup, 3),
    ],
  })
  assert.deepEqual(
    byId(menuEntries).map((row) =>
      pick(row, ["id", "menuId", "recipeId", "day", "updatedAt"]),
    ),
    [
      { id: stew, menuId: winter, recipeId, day: 1, updatedAt: 1000 },
      { id: soup, menuId: winter, recipeId, day: 4, updatedAt: 3000 },
    ],
  )
})

test("a removed menu entry stays removed, with moves either side of the remove", async () => {
  const { menuEntries } = await converge({
    layer: makeLayer,
    read,
    setup: [
      menuAdded(winter, "Winter warmers"),
      added(1000, soup, winter, 1),
      added(1000, stew, winter, 1),
    ],
    concurrent: [
      moved(2000, soup, 2),
      removed(3000, soup),
      // A move from a device that hadn't seen the remove yet.
      moved(4000, soup, 3),
      moved(2500, stew, 5),
    ],
  })
  assert.deepEqual(pick(only(menuEntries), ["id", "day"]), {
    id: stew,
    day: 5,
  })
})

test("a re-added menu day note merges with concurrent updates under last-writer-wins", async () => {
  const { menuDayNotes } = await converge({
    layer: makeLayer,
    read,
    setup: [
      menuAdded(winter, "Winter warmers"),
      noteAdded(1000, firstNote, winter, 1, "Leftovers"),
      noteAdded(1000, secondNote, winter, 5, "Takeaway"),
    ],
    concurrent: [
      // A newer add of an existing note writes its fields...
      noteUpdated(2000, firstNote, 1, "Pizza"),
      noteAdded(3000, firstNote, winter, 2, "Tacos"),
      // ...and an older one loses to a newer update.
      noteAdded(2500, secondNote, winter, 5, "Fish and chips"),
      noteUpdated(3500, secondNote, 4, "Curry"),
    ],
  })
  assert.deepEqual(
    byId(menuDayNotes).map((row) =>
      pick(row, ["id", "menuId", "day", "note", "updatedAt"]),
    ),
    [
      {
        id: secondNote,
        menuId: winter,
        day: 4,
        note: "Curry",
        updatedAt: 3500,
      },
      { id: firstNote, menuId: winter, day: 2, note: "Tacos", updatedAt: 3000 },
    ],
  )
})

test("a removed menu day note stays removed, with updates either side of the remove", async () => {
  const { menuDayNotes } = await converge({
    layer: makeLayer,
    read,
    setup: [
      menuAdded(winter, "Winter warmers"),
      noteAdded(1000, firstNote, winter, 1, "Leftovers"),
      noteAdded(1000, secondNote, winter, 5, "Takeaway"),
    ],
    concurrent: [
      noteUpdated(2000, firstNote, 1, "Pizza"),
      noteRemoved(3000, firstNote),
      // An update from a device that hadn't seen the remove yet.
      noteUpdated(4000, firstNote, 1, "Tacos"),
      noteUpdated(2500, secondNote, 5, "Curry"),
    ],
  })
  assert.deepEqual(pick(only(menuDayNotes), ["id", "day", "note"]), {
    id: secondNote,
    day: 5,
    note: "Curry",
  })
})

test("removing a menu removes its entries and notes, with writes to them either side of the remove", async () => {
  const state = await converge({
    layer: makeLayer,
    read,
    setup: [
      menuAdded(winter, "Winter warmers"),
      menuAdded(summer, "Summer"),
      added(1000, soup, winter, 1),
      added(1000, salad, summer, 1),
      noteAdded(1000, firstNote, winter, 1, "Leftovers"),
      noteAdded(1000, secondNote, summer, 2, "Barbecue"),
    ],
    concurrent: [
      moved(2000, soup, 2),
      noteUpdated(2500, firstNote, 1, "Pizza"),
      menuRemoved(3000, winter),
      // An update from a device that hadn't seen the remove yet can't bring
      // the menu back.
      menuUpdated(4000, winter, { name: "Winter", days: 7 }),
      moved(2500, salad, 3),
    ],
  })
  assert.deepEqual(pick(only(state.menus), ["id", "name"]), {
    id: summer,
    name: "Summer",
  })
  assert.deepEqual(pick(only(state.menuEntries), ["id", "day"]), {
    id: salad,
    day: 3,
  })
  assert.deepEqual(pick(only(state.menuDayNotes), ["id", "note"]), {
    id: secondNote,
    note: "Barbecue",
  })
})

// An entry or note added on a device that hadn't seen the menu's remove can
// land after the cascade has run. TIM-249 accepts these orphans: reads go
// through the menu, so they never show. Compare what a read through the
// remaining menus sees.
const readThroughMenus = Effect.gen(function* () {
  const { menus, menuEntries, menuDayNotes } = yield* read
  const menuIds = new Set(menus.map(idOf))
  const ofMenu = (row: Row) => menuIds.has(uuidString(row.menuId as Uint8Array))
  return {
    menus,
    menuEntries: menuEntries.filter(ofMenu),
    menuDayNotes: menuDayNotes.filter(ofMenu),
  }
})

test("entries and notes added to a menu concurrently with its remove never show", async () => {
  const state = await converge({
    layer: makeLayer,
    read: readThroughMenus,
    setup: [
      menuAdded(winter, "Winter warmers"),
      menuAdded(summer, "Summer"),
      added(1000, soup, winter, 1),
    ],
    concurrent: [
      menuRemoved(3000, winter),
      added(2000, stew, winter, 2),
      noteAdded(2500, lateNote, winter, 3, "Pizza"),
      added(2000, salad, summer, 1),
    ],
  })
  assert.deepEqual(pick(only(state.menus), ["id"]), { id: summer })
  assert.deepEqual(pick(only(state.menuEntries), ["id", "menuId"]), {
    id: salad,
    menuId: summer,
  })
  assert.deepEqual(state.menuDayNotes, [])
})

test("shrinking a menu removes the entries and notes on the days it drops, with writes to them either side", async () => {
  const state = await converge({
    layer: makeLayer,
    read,
    setup: [
      menuAdded(winter, "Winter warmers"),
      menuAdded(summer, "Summer"),
      added(1000, soup, winter, 2),
      added(1000, stew, winter, 6),
      // Another menu's entry on a dropped day is untouched.
      added(1000, pie, summer, 7),
      noteAdded(1000, firstNote, winter, 3, "Leftovers"),
      noteAdded(1000, secondNote, winter, 6, "Takeaway"),
    ],
    concurrent: [
      menuUpdated(2000, winter, { name: "Winter warmers", days: 5 }),
      // Onto the new last day, which stays.
      moved(2500, soup, 5),
      // Within the dropped days.
      moved(1500, stew, 7),
      noteUpdated(3000, firstNote, 3, "Pizza"),
      noteUpdated(2500, secondNote, 6, "Curry"),
    ],
  })
  assert.deepEqual(
    byId(state.menus).map((row) => pick(row, ["id", "days"])),
    [
      { id: summer, days: 7 },
      { id: winter, days: 5 },
    ],
  )
  assert.deepEqual(
    byId(state.menuEntries).map((row) => pick(row, ["id", "menuId", "day"])),
    [
      { id: pie, menuId: summer, day: 7 },
      { id: soup, menuId: winter, day: 5 },
    ],
  )
  assert.deepEqual(pick(only(state.menuDayNotes), ["id", "day", "note"]), {
    id: firstNote,
    day: 3,
    note: "Pizza",
  })
})
