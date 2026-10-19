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
import {
  MenuDayNoteEvent,
  MenuEntryEvent,
  MenuEvent,
  MenuEvents,
} from "@/Menus/Events"
import { MenuRepo } from "@/Menus/Repo"
import { RecipeRepo } from "@/Recipes/Repo"
import { MenuIdFromString } from "@/domain/Menu"
import { MenuDayNoteIdFromString } from "@/domain/MenuDayNote"
import { MenuEntryIdFromString } from "@/domain/MenuEntry"
import { RecipeIdFromString } from "@/domain/Recipe"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
  withoutCompaction,
} from "./harness/convergence"

// A removed menu stays as a marker. Entries and notes are separate rows, so
// their writes never conflict with the menu's remove: their handlers skip a
// write when the menu is marked removed and apply it when the menu hasn't
// arrived, and the remove deletes whatever the menu has by then.
//
// Shrinking a menu is a plain patch of `days` and deletes nothing itself: its
// writer removes the entries and notes it saw on the dropped days.
//
// Each order is replayed as a compacted batch, an uncompacted batch and one
// entry at a time. Compaction drops the winter `set` the remove shadows, so
// the remove can arrive for a menu that was never stored.

const menu = MenuEvents.events[MenuEvent.tag]
const menuEntry = MenuEvents.events[MenuEntryEvent.tag]
const menuDayNote = MenuEvents.events[MenuDayNoteEvent.tag]

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)
const winter = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f6",
)
const summer = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f0",
)
const soup = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f7",
)
const salad = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e2",
)
const stew = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5e1",
)
const note = Schema.decodeSync(MenuDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f8",
)

const menuSet = (msecs: number, id: typeof winter, name: string) =>
  makeEntry({
    msecs,
    event: menu,
    payload: MenuEvent.set({
      id,
      name,
      days: 7,
      createdAt: DateTime.makeUnsafe(msecs),
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const entrySet = (
  msecs: number,
  id: typeof soup,
  menuId: typeof winter,
  day: number,
) =>
  makeEntry({
    msecs,
    event: menuEntry,
    payload: MenuEntryEvent.set({
      id,
      menuId,
      recipeId,
      day,
      createdAt: DateTime.makeUnsafe(msecs),
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const makeLayer =
  (handlers: typeof MenusLayer): MakeLayer<MenuRepo> =>
  (identity, remote) => {
    const eventLog = EventLog.layer(EventLog.schema(MenuEvents), handlers).pipe(
      Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
      Layer.provide(Layer.succeed(EventLog.Identity, identity)),
    )
    return Layer.mergeAll(
      eventLog,
      remote.pipe(Layer.provide(eventLog)),
      MenuRepo.layer.pipe(Layer.provide(RecipeRepo.layer)),
    ).pipe(
      Layer.provideMerge(QueryBuilder.layer),
      Layer.provideMerge(layerDatabase),
      Layer.provideMerge(Reactivity.layer),
      Layer.provideMerge(layerFreshIndexedDb),
    )
  }

const read = Effect.gen(function* () {
  const repo = yield* MenuRepo
  return {
    menus: yield* readTable("menus"),
    menuEntries: yield* readTable("menuEntries"),
    menuDayNotes: yield* readTable("menuDayNotes"),
    shown: (yield* repo.all).map((menu) => ({
      id: menu.idString,
      name: menu.name,
      days: menu.days,
    })),
  }
})

test("a removed menu ends without entries or notes, whatever writes reach it and in whatever order", async () => {
  const state = await converge({
    layer: makeLayer(MenusLayer),
    uncompacted: makeLayer(withoutCompaction(MenusLayer)),
    read,
    // Summer and its entry are never removed.
    setup: [menuSet(1000, summer, "Summer"), entrySet(1000, salad, summer, 3)],
    concurrent: [
      menuSet(1000, winter, "Winter warmers"),
      entrySet(1500, soup, winter, 1),
      makeEntry({
        msecs: 3000,
        event: menu,
        payload: MenuEvent.remove({ id: winter }),
      }),
      // From devices that hadn't seen the remove yet.
      makeEntry({
        msecs: 3500,
        event: menuDayNote,
        payload: MenuDayNoteEvent.set({
          id: note,
          menuId: winter,
          day: 1,
          note: "Leftovers",
          createdAt: DateTime.makeUnsafe(3500),
          updatedAt: DateTime.makeUnsafe(3500),
        }),
      }),
      makeEntry({
        msecs: 4000,
        event: menu,
        payload: MenuEvent.patch(
          { id: winter },
          {
            name: "Winter",
            updatedAt: DateTime.makeUnsafe(4000),
          },
        ),
      }),
    ],
  })
  assert.deepEqual(state.shown, [
    { id: "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f0", name: "Summer", days: 7 },
  ])
  assert.deepEqual(pick(only(state.menuEntries), ["id", "day"]), {
    id: salad,
    day: 3,
  })
  assert.deepEqual(state.menuDayNotes, [])
})

// A row its writer never saw survives on a dropped day, where reads don't
// show it.
test("an entry or note added on a dropped day concurrently with the shrink stays there", async () => {
  const state = await converge({
    layer: makeLayer(MenusLayer),
    uncompacted: makeLayer(withoutCompaction(MenusLayer)),
    read,
    setup: [menuSet(1000, winter, "Winter warmers")],
    concurrent: [
      makeEntry({
        msecs: 2000,
        event: menu,
        payload: MenuEvent.patch(
          { id: winter },
          {
            days: 5,
            updatedAt: DateTime.makeUnsafe(2000),
          },
        ),
      }),
      // Older and newer than the shrink: neither is deleted.
      entrySet(1500, stew, winter, 6),
      makeEntry({
        msecs: 2500,
        event: menuDayNote,
        payload: MenuDayNoteEvent.set({
          id: note,
          menuId: winter,
          day: 7,
          note: "Curry",
          createdAt: DateTime.makeUnsafe(2500),
          updatedAt: DateTime.makeUnsafe(2500),
        }),
      }),
    ],
  })
  assert.deepEqual(state.shown, [
    {
      id: "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f6",
      name: "Winter warmers",
      days: 5,
    },
  ])
  assert.deepEqual(pick(only(state.menuEntries), ["id", "day"]), {
    id: stew,
    day: 6,
  })
  assert.deepEqual(pick(only(state.menuDayNotes), ["id", "day", "note"]), {
    id: note,
    day: 7,
    note: "Curry",
  })
})
