import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import { Menu, type MenuId } from "./domain/Menu"
import { MenuDayNote, type MenuDayNoteId } from "./domain/MenuDayNote"
import { MenuEntry, type MenuEntryId } from "./domain/MenuEntry"
import { QueryBuilder } from "./IndexedDb"
import * as Compaction from "./lib/Compaction"
import { eventFields } from "./lib/eventFields"
import { uuidString } from "./lib/Id"
import { applyLww, stampAll } from "./lib/Lww"
import { MenuEvents } from "./Menus/Events"

// Handlers converge whatever order remote entries arrive in: adds
// insert only when the row is missing, `MenuUpdate`, `MenuEntrySetDay` and
// note updates patch under last-writer-wins and do nothing when the row is
// missing, and removes hard-delete, so a late update can't bring a row back.
// A day note add on an existing row (a re-import) merges under
// last-writer-wins.
//
// `MenuRemove` also deletes the menu's entries and notes through the `menuId`
// index. A `MenuUpdate` that shrinks `days` deletes nothing: its writer emits
// removes for the entries and notes it saw on the dropped days, so a
// concurrent write it never saw survives, past the last day where reads don't
// show it. An entry or note can also outlive its menu when it was added
// concurrently with the remove; reads go through the menu, so it never shows.

const menuFields = eventFields(Menu.insert)
const entryFields = eventFields(MenuEntry.insert)
const noteFields = eventFields(MenuDayNote.insert)

const menuUpdate = ({ name, days, updatedAt }: typeof Menu.update.Type) => ({
  name,
  days,
  updatedAt,
})

const entryDay = ({
  day,
  updatedAt,
}: {
  readonly day: number
  readonly updatedAt: DateTime.Utc
}) => ({
  day,
  updatedAt,
})

const noteUpdate = ({
  day,
  note,
  updatedAt,
}: typeof MenuDayNote.update.Type) => ({
  day,
  note,
  updatedAt,
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

    const entryRow = (id: MenuEntryId) =>
      entries
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    const noteRow = (id: MenuDayNoteId) =>
      notes
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))

    return handlers
      .handle("MenuAdd", ({ payload, entry }) =>
        Effect.gen(function* () {
          if ((yield* menuRow(payload.id)) !== undefined) return
          yield* menus.insert(stampAll(menuFields(payload), entry))
        }).pipe(Effect.orDie),
      )
      .handle("MenuUpdate", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* menuRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, menuUpdate(payload), entry)
          if (next !== row) yield* menus.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MenuRemove", ({ payload }) =>
        Effect.gen(function* () {
          yield* menus.delete().equals(payload.id)
          yield* entries.delete("menuId").equals(payload.id)
          yield* notes.delete("menuId").equals(payload.id)
        }).pipe(
          db.withTransaction({
            tables: ["menus", "menuEntries", "menuDayNotes"],
            mode: "readwrite",
          }),
          Effect.orDie,
        ),
      )
      .handle("MenuEntryAdd", ({ payload, entry }) =>
        Effect.gen(function* () {
          if ((yield* entryRow(payload.id)) !== undefined) return
          yield* entries.insert(stampAll(entryFields(payload), entry))
        }).pipe(Effect.orDie),
      )
      .handle("MenuEntrySetDay", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* entryRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, entryDay(payload), entry)
          if (next !== row) yield* entries.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MenuEntryRemove", ({ payload }) =>
        entries.delete().equals(payload.id).pipe(Effect.orDie),
      )
      .handle("MenuDayNoteAdd", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* noteRow(payload.id)
          const fields = noteFields(payload)
          if (row === undefined) {
            yield* notes.insert(stampAll(fields, entry))
            return
          }
          const next = applyLww(row, fields, entry)
          if (next !== row) yield* notes.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MenuDayNoteUpdate", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* noteRow(payload.id)
          if (row === undefined) return
          const next = applyLww(row, noteUpdate(payload), entry)
          if (next !== row) yield* notes.upsert(next)
        }).pipe(Effect.orDie),
      )
      .handle("MenuDayNoteRemove", ({ payload }) =>
        notes.delete().equals(payload.id).pipe(Effect.orDie),
      )
  }),
)

const MenuReactivity = EventLog.groupReactivity(MenuEvents, {
  MenuAdd: ["menus"],
  MenuUpdate: ["menus"],
  MenuRemove: ["menus", "menuEntries", "menuDayNotes"],
  MenuEntryAdd: ["menuEntries"],
  MenuEntrySetDay: ["menuEntries"],
  MenuEntryRemove: ["menuEntries"],
  MenuDayNoteAdd: ["menuDayNotes"],
  MenuDayNoteUpdate: ["menuDayNotes"],
  MenuDayNoteRemove: ["menuDayNotes"],
})

// `MenuRemove` is a remove of the menu row only. The entries and notes it
// cascades to are found through the table at replay time, so their own
// entries are all replayed.
const MenuCompaction = Compaction.layer(MenuEvents, {
  MenuAdd: () => Compaction.create("menus"),
  MenuUpdate: (payload) => Compaction.patch("menus", menuUpdate(payload)),
  MenuRemove: ({ id }) => Compaction.remove("menus", [uuidString(id)]),
  MenuEntryAdd: () => Compaction.create("menuEntries"),
  MenuEntrySetDay: (payload) =>
    Compaction.patch("menuEntries", entryDay(payload)),
  MenuEntryRemove: ({ id }) =>
    Compaction.remove("menuEntries", [uuidString(id)]),
  MenuDayNoteAdd: (payload) =>
    Compaction.set("menuDayNotes", noteFields(payload)),
  MenuDayNoteUpdate: (payload) =>
    Compaction.patch("menuDayNotes", noteUpdate(payload)),
  MenuDayNoteRemove: ({ id }) =>
    Compaction.remove("menuDayNotes", [uuidString(id)]),
})

export const MenusLayer = Layer.mergeAll(
  MenuHandlers,
  MenuReactivity,
  MenuCompaction,
)
