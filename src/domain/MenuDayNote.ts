import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"

export class MenuDayNote extends Model.Class<MenuDayNote>("MenuDayNote")({
  id: Model.GeneratedByApp(Schema.String),
  menuId: Model.Field({
    insert: Schema.String,
  }),
  day: Schema.Number,
  note: Schema.String,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldExcept("update", "jsonCreate", "jsonUpdate"),
  ),
  updatedAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldExcept("jsonCreate", "jsonUpdate"),
  ),
}) {
  static array = Schema.Array(MenuDayNote)

  static fromForm(
    input: Pick<typeof MenuDayNote.insert.Type, "menuId" | "day" | "note">,
  ) {
    return MenuDayNote.insert.make({
      id: crypto.randomUUID(),
      menuId: input.menuId,
      day: input.day,
      note: input.note,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }
}
