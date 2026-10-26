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
import { type MakeLayer, converge, only, pick } from "./harness/convergence"

// A removed menu stays as a marker. Entries and notes are separate rows, so
// their writes never conflict with the menu's remove: their handlers skip a
// write when the menu is marked removed and apply it when the menu hasn't
// arrived, and the remove deletes whatever the menu has by then.
//
// Shrinking a menu is a plain patch of `days` and deletes nothing itself: its
// writer removes the entries and notes it saw on the dropped days.
//
// Compaction drops the winter `set` the remove shadows, so the remove can
// arrive for a menu that was never stored.

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
    }).payload,
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
    }).payload,
  })

const layer: MakeLayer<MenuRepo> = (identity, remote) => {
  const eventLog = EventLog.layer(EventLog.schema(MenuEvents), MenusLayer).pipe(
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
    menuEntries: yield* repo.entries,
    menuDayNotes: yield* repo.notes,
    shown: (yield* repo.all).map((menu) => ({
      id: menu.idString,
      name: menu.name,
      days: menu.days,
    })),
  }
})

const winterSet = menuSet(1000, winter, "Winter warmers")
const winterRemoved = makeEntry({
  msecs: 3000,
  event: menu,
  payload: MenuEvent.remove({ id: winter }).payload,
})
// Summer and its entry are never removed.
const summerSetup = [
  menuSet(1000, summer, "Summer"),
  entrySet(1000, salad, summer, 3),
]

test("a removed menu ends without entries or notes, whatever writes reach it and in whatever order", async () => {
  // The entry and the note are separate rows, so each is permuted with the
  // menu's writes on its own.
  const withEntry = await converge({
    layer,
    read,
    setup: summerSetup,
    concurrent: [
      winterSet,
      entrySet(1500, soup, winter, 1),
      winterRemoved,
      // From a device that hadn't seen the remove yet.
      makeEntry({
        msecs: 4000,
        event: menu,
        payload: MenuEvent.patch(
          { id: winter },
          {
            name: "Winter",
            updatedAt: DateTime.makeUnsafe(4000),
          },
        ).payload,
      }),
    ],
  })
  const withNote = await converge({
    layer,
    read,
    setup: summerSetup,
    concurrent: [
      winterSet,
      winterRemoved,
      // From a device that hadn't seen the remove yet.
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
        }).payload,
      }),
    ],
  })
  for (const state of [withEntry, withNote]) {
    assert.deepEqual(state.shown, [
      { id: "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f0", name: "Summer", days: 7 },
    ])
    assert.deepEqual(pick(only(state.menuEntries), ["id", "day"]), {
      id: salad,
      day: 3,
    })
    assert.deepEqual(state.menuDayNotes, [])
  }
})

// A row its writer never saw survives on a dropped day, where reads don't
// show it.
test("an entry or note added on a dropped day concurrently with the shrink stays there", async () => {
  const state = await converge({
    layer,
    read,
    setup: [winterSet],
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
        ).payload,
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
        }).payload,
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
