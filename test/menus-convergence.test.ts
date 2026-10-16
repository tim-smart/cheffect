import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MenusLayer } from "@/Menus"
import { MenuEvents } from "@/Menus/Events"
import { Menu, MenuIdFromString } from "@/domain/Menu"
import { MenuDayNote, MenuDayNoteIdFromString } from "@/domain/MenuDayNote"
import { MenuEntry, MenuEntryIdFromString } from "@/domain/MenuEntry"
import { RecipeIdFromString } from "@/domain/Recipe"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Menus handlers converge whatever order remote entries arrive in.
// `MenuRemove` is the one handler that writes beyond its own row: it deletes
// the menu's entries and notes through the `menuId` index. A `MenuUpdate`
// that shrinks `days` is a plain patch; its writer emits removes for the
// entries and notes it can see past the new last day.
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
  MenuDayNoteAdd,
  MenuDayNoteUpdate,
} = MenuEvents.events

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)

const winter = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f6",
)
const summer = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f0",
)
type MenuId = typeof winter

const soup = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f7",
)
const stew = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e1",
)
const salad = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e2",
)
type EntryId = typeof soup

const firstNote = Schema.decodeSync(MenuDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f8",
)
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

// A shrink is a plain update and deletes nothing itself, so a row its writer
// never saw survives on a dropped day, where reads don't show it.
test("an entry or note added on a dropped day concurrently with the shrink stays there", async () => {
  const state = await converge({
    layer: makeLayer,
    read,
    setup: [menuAdded(winter, "Winter warmers")],
    concurrent: [
      menuUpdated(2000, winter, { name: "Winter warmers", days: 5 }),
      // Older and newer than the shrink: neither is deleted.
      added(1500, stew, winter, 6),
      noteAdded(2500, lateNote, winter, 7, "Curry"),
    ],
  })
  assert.deepEqual(pick(only(state.menus), ["days"]), { days: 5 })
  assert.deepEqual(pick(only(state.menuEntries), ["id", "day"]), {
    id: stew,
    day: 6,
  })
  assert.deepEqual(pick(only(state.menuDayNotes), ["id", "day", "note"]), {
    id: lateNote,
    day: 7,
    note: "Curry",
  })
})
