import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { Menu } from "@/domain/Menu"
import { MenuDayNote } from "@/domain/MenuDayNote"
import { MenuEntry } from "@/domain/MenuEntry"

// Rows are the stored fields plus the hidden last-writer-wins stamps. Ids are
// random, so removes hard-delete and need no tombstone. Entries and notes are
// indexed by `menuId` for the `MenuRemove` cascade.
const Lww = Schema.Record(Schema.String, Schema.String)

export const MenuRow = Schema.Struct({
  ...Menu.fields,
  _lww: Lww,
})
export type MenuRow = typeof MenuRow.Type

export class MenusTable extends IndexedDbTable.make({
  name: "menus",
  schema: MenuRow,
  keyPath: "id",
}) {}

// An entry keeps its recipe's id; the repo joins it with the recipes snapshot.
export const MenuEntryRow = Schema.Struct({
  ...MenuEntry.insert.fields,
  _lww: Lww,
})
export type MenuEntryRow = typeof MenuEntryRow.Type

export class MenuEntriesTable extends IndexedDbTable.make({
  name: "menuEntries",
  schema: MenuEntryRow,
  keyPath: "id",
  indexes: { menuId: "menuId" },
}) {}

export const MenuDayNoteRow = Schema.Struct({
  ...MenuDayNote.insert.fields,
  _lww: Lww,
})
export type MenuDayNoteRow = typeof MenuDayNoteRow.Type

export class MenuDayNotesTable extends IndexedDbTable.make({
  name: "menuDayNotes",
  schema: MenuDayNoteRow,
  keyPath: "id",
  indexes: { menuId: "menuId" },
}) {}
