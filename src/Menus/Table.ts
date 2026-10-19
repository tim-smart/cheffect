import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { Menu } from "@/domain/Menu"
import { MenuDayNoteEvent, MenuEntryEvent } from "./Events"

// A removed menu stays as a marker row, `removed: true` with every other
// field blank, and reads skip it. Entries and notes are indexed by `menuId`
// for the remove's cascade.
export const MenuRow = Schema.Struct({
  ...Menu.fields,
  removed: Schema.Boolean,
})
export type MenuRow = typeof MenuRow.Type

export class MenusTable extends IndexedDbTable.make({
  name: "menus",
  schema: MenuRow,
  keyPath: "id",
}) {}

// An entry keeps its recipe's id; the repo joins it with the recipes snapshot.
export const MenuEntryRow = MenuEntryEvent.schema
export type MenuEntryRow = typeof MenuEntryRow.Type

export class MenuEntriesTable extends IndexedDbTable.make({
  name: "menuEntries",
  schema: MenuEntryRow,
  keyPath: "id",
  indexes: { menuId: "menuId" },
}) {}

export const MenuDayNoteRow = MenuDayNoteEvent.schema
export type MenuDayNoteRow = typeof MenuDayNoteRow.Type

export class MenuDayNotesTable extends IndexedDbTable.make({
  name: "menuDayNotes",
  schema: MenuDayNoteRow,
  keyPath: "id",
  indexes: { menuId: "menuId" },
}) {}
