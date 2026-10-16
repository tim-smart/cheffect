import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"
import {
  generateUuidBytes,
  UuidBytes,
  UuidFromString,
  uuidString,
} from "@/lib/Id"
import { MenuId } from "./Menu"

export const MenuDayNoteId = UuidBytes("MenuDayNoteId")
export type MenuDayNoteId = typeof MenuDayNoteId.Type
export const MenuDayNoteIdFromString = UuidFromString(MenuDayNoteId)

export class MenuDayNote extends Model.Class<MenuDayNote>("MenuDayNote")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: MenuDayNoteId,
    insert: MenuDayNoteId,
    update: MenuDayNoteId,
    json: MenuDayNoteIdFromString,
  }),
  menuId: Model.Field({
    insert: MenuId,
  }),
  day: Schema.Number,
  note: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {
  static array = Schema.Array(MenuDayNote)

  static fromForm(
    input: Pick<typeof MenuDayNote.insert.Type, "menuId" | "day" | "note">,
  ) {
    return MenuDayNote.insert.make({
      id: MenuDayNoteId.make(generateUuidBytes()),
      menuId: input.menuId,
      day: input.day,
      note: input.note,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  get idString(): string {
    return uuidString(this.id)
  }
}
