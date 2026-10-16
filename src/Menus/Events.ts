import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import { Menu, MenuId } from "@/domain/Menu"
import { MenuDayNote, MenuDayNoteId } from "@/domain/MenuDayNote"
import { MenuEntry, MenuEntryId } from "@/domain/MenuEntry"
import { uuidString } from "@/lib/Id"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays. `v1.MenuDayRemove` was never emitted and is dropped:
// shrinking a menu is a `MenuUpdate` plus removes for what the writer saw on
// the dropped days.
export const MenuEvents = EventGroup.empty
  .add({
    tag: "MenuAdd",
    primaryKey: (menu) => uuidString(menu.id),
    payload: Menu.insert,
  })
  .add({
    tag: "MenuUpdate",
    primaryKey: (menu) => uuidString(menu.id),
    payload: Menu.update,
  })
  .add({
    tag: "MenuRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: MenuId }),
  })
  .add({
    tag: "MenuEntryAdd",
    primaryKey: (entry) => uuidString(entry.id),
    payload: MenuEntry.insert,
  })
  .add({
    tag: "MenuEntrySetDay",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({
      id: MenuEntryId,
      day: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromMillis,
    }),
  })
  .add({
    tag: "MenuEntryRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: MenuEntryId }),
  })
  .add({
    tag: "MenuDayNoteAdd",
    primaryKey: (note) => uuidString(note.id),
    payload: MenuDayNote.insert,
  })
  .add({
    tag: "MenuDayNoteUpdate",
    primaryKey: (note) => uuidString(note.id),
    payload: MenuDayNote.update,
  })
  .add({
    tag: "MenuDayNoteRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: MenuDayNoteId }),
  })
