import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"

export class MenuDayNote extends Model.Class<MenuDayNote>("MenuDayNote")({
  id: Model.GeneratedByApp(Schema.String),
  menuId: Schema.String,
  day: Schema.Number,
  note: Schema.String,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(Model.FieldExcept("update")),
  updatedAt: Schema.DateTimeUtcFromNumber,
}) {
  static array = Schema.Array(MenuDayNote)

  static fromForm(
    input: Pick<MenuDayNote, "menuId" | "day" | "note">,
  ): MenuDayNote {
    return new MenuDayNote({
      id: crypto.randomUUID(),
      menuId: input.menuId,
      day: input.day,
      note: input.note,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }
}
