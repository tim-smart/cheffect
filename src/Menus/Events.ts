import type * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import { Menu } from "@/domain/Menu"
import { MenuDayNote } from "@/domain/MenuDayNote"
import { MenuEntry, type MenuEntryId } from "@/domain/MenuEntry"
import { uuidKey, uuidString } from "@/lib/Id"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed.
//
// Entries and notes are rows of their own, so their writes never conflict
// with their menu's remove. A removed menu stays as a marker instead, which
// their handlers check. That converges only while a removed menu's id is
// never set again, and an entry or note never moves to another menu: `menuId`
// is a key field, so no patch can write it. Shrinking a menu is a menu patch
// plus a remove for each entry and note the writer saw on the dropped days.
export const MenuEvent = EventRow.make("Menu", {
  key: uuidKey,
  schema: Schema.Struct(Menu.fields),
})

// Keyed by id alone; `menuId` is declared only to keep it out of patches.
const childKey = {
  fields: ["id", "menuId"],
  derive: ({ id }: { readonly id: Uint8Array }) => uuidString(id),
} as const

export const MenuEntryEvent = EventRow.make("MenuEntry", {
  key: childKey,
  schema: Schema.Struct(MenuEntry.insert.fields),
})

export const MenuDayNoteEvent = EventRow.make("MenuDayNote", {
  key: childKey,
  schema: Schema.Struct(MenuDayNote.insert.fields),
})

export const MenuEvents = EventGroup.empty
  .add(MenuEvent)
  .add(MenuEntryEvent)
  .add(MenuDayNoteEvent)

export const menuUpdate = (menu: typeof Menu.update.Type) =>
  MenuEvent.patch(uuidString(menu.id), {
    name: menu.name,
    days: menu.days,
    updatedAt: menu.updatedAt,
  })

export const menuEntryDay = (
  id: MenuEntryId,
  day: number,
  updatedAt: DateTime.Utc,
) => MenuEntryEvent.patch(uuidString(id), { day, updatedAt })

export const menuDayNoteUpdate = (note: typeof MenuDayNote.update.Type) =>
  MenuDayNoteEvent.patch(uuidString(note.id), {
    day: note.day,
    note: note.note,
    updatedAt: note.updatedAt,
  })
