import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { MenuId } from "./domain/Menu"
import { MenuDayNoteId } from "./domain/MenuDayNote"
import { MenuEntryId } from "./domain/MenuEntry"
import { QueryBuilder, withWriteTransaction } from "./IndexedDb"
import { uuidBytes } from "./lib/Id"
import {
  MenuDayNoteEvent,
  MenuEntryEvent,
  MenuEvent,
  MenuEvents,
} from "./Menus/Events"
import type { MenuRow } from "./Menus/Table"

// Entries and notes are separate rows from their menu, so a menu remove
// doesn't conflict with a concurrent write to one of them. A removed menu
// stays as a marker, and every replica ends without the entries and notes of
// removed menus, whatever the delivery order:
//
// - The menu `remove` marks the menu and deletes its entries and notes. It
//   writes the marker even when the menu was never stored, e.g. when
//   compaction dropped the `set` it shadows.
// - An entry or note `set` or `patch` is skipped when its menu is marked, and
//   applied when the menu hasn't arrived yet.
// - A menu `patch` skips a marker, and the marker's fields are blank, so it
//   holds the same values on every replica.
//
// Removing a menu is final: no writer sets a removed menu's id again, and an
// import skips rows this device has entries for. Markers stay.

const marker = (id: MenuId): MenuRow => ({
  id,
  name: "",
  days: 0,
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
  removed: true,
})

const MenuHandlers = EventLog.group(MenuEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const menus = db.from("menus")
    const entries = db.from("menuEntries")
    const notes = db.from("menuDayNotes")

    const menuRow = (id: MenuId) =>
      menus
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    const menuRemoved = (id: MenuId) =>
      menuRow(id).pipe(Effect.map((row) => row?.removed === true))

    return handlers
      .handle(
        MenuEvent.tag,
        EventRow.handler(MenuEvent, {
          set: (menu) =>
            menus.upsert({ ...menu, removed: false }).pipe(Effect.orDie),
          patch: (key, fields) =>
            Effect.gen(function* () {
              const row = yield* menuRow(MenuId.make(uuidBytes(key)))
              if (row === undefined || row.removed) return
              yield* menus.upsert({ ...row, ...fields })
            }).pipe(Effect.orDie),
          remove: (key) =>
            Effect.gen(function* () {
              const id = MenuId.make(uuidBytes(key))
              yield* menus.upsert(marker(id))
              yield* entries.delete("menuId").equals(id)
              yield* notes.delete("menuId").equals(id)
            }).pipe(
              withWriteTransaction(db, [
                "menus",
                "menuEntries",
                "menuDayNotes",
              ]),
              Effect.orDie,
            ),
        }),
      )
      .handle(
        MenuEntryEvent.tag,
        EventRow.handler(MenuEntryEvent, {
          set: (entry) =>
            Effect.gen(function* () {
              if (yield* menuRemoved(entry.menuId)) return
              yield* entries.upsert(entry)
            }).pipe(Effect.orDie),
          patch: (key, fields) =>
            Effect.gen(function* () {
              const [row] = yield* entries
                .select()
                .equals(MenuEntryId.make(uuidBytes(key)))
                .limit(1)
              if (row === undefined) return
              const next = { ...row, ...fields }
              if (yield* menuRemoved(next.menuId)) return
              yield* entries.upsert(next)
            }).pipe(Effect.orDie),
          remove: (key) =>
            entries
              .delete()
              .equals(MenuEntryId.make(uuidBytes(key)))
              .pipe(Effect.orDie),
        }),
      )
      .handle(
        MenuDayNoteEvent.tag,
        EventRow.handler(MenuDayNoteEvent, {
          set: (note) =>
            Effect.gen(function* () {
              if (yield* menuRemoved(note.menuId)) return
              yield* notes.upsert(note)
            }).pipe(Effect.orDie),
          patch: (key, fields) =>
            Effect.gen(function* () {
              const [row] = yield* notes
                .select()
                .equals(MenuDayNoteId.make(uuidBytes(key)))
                .limit(1)
              if (row === undefined) return
              const next = { ...row, ...fields }
              if (yield* menuRemoved(next.menuId)) return
              yield* notes.upsert(next)
            }).pipe(Effect.orDie),
          remove: (key) =>
            notes
              .delete()
              .equals(MenuDayNoteId.make(uuidBytes(key)))
              .pipe(Effect.orDie),
        }),
      )
  }),
)

const MenuReactivity = EventLog.groupReactivity(MenuEvents, {
  [MenuEvent.tag]: ["menus", "menuEntries", "menuDayNotes"],
  [MenuEntryEvent.tag]: ["menuEntries"],
  [MenuDayNoteEvent.tag]: ["menuDayNotes"],
})

export const MenusLayer = Layer.mergeAll(
  MenuHandlers,
  MenuReactivity,
  EventRow.compaction(MenuEvents, MenuEvent),
  EventRow.compaction(MenuEvents, MenuEntryEvent),
  EventRow.compaction(MenuEvents, MenuDayNoteEvent),
)
