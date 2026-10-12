import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"
import { UnknownToXml } from "./Xml"

export class Menu extends Model.Class<Menu>("Menu")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  days: Schema.Number,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(Model.FieldExcept(["update"])),
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {
  static array = Schema.Array(Menu)
  static xml = UnknownToXml.pipe(
    Schema.decodeTo(Schema.Struct({ menu: Menu.json })),
  )

  static fromForm(input: Pick<Menu, "name">) {
    return new Menu({
      id: crypto.randomUUID(),
      name: input.name,
      days: 7,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  toXml() {
    return Schema.encodeSync(Menu.xml)({ menu: this })
  }
}
