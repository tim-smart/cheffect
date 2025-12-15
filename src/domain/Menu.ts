import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"

export class Menu extends Model.Class<Menu>("Menu")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  days: Schema.Number,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(Model.FieldExcept("update")),
  updatedAt: Schema.DateTimeUtcFromNumber,
}) {
  static array = Schema.Array(Menu)

  static fromForm(input: Pick<Menu, "name">) {
    return new Menu({
      id: crypto.randomUUID(),
      name: input.name,
      days: 7,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }
}
