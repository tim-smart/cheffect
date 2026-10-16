import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"
import {
  generateUuidBytes,
  UuidBytes,
  UuidFromString,
  uuidString,
} from "@/lib/Id"
import { UnknownToXml } from "./Xml"

export const MenuId = UuidBytes("MenuId")
export type MenuId = typeof MenuId.Type
export const MenuIdFromString = UuidFromString(MenuId)

export class Menu extends Model.Class<Menu>("Menu")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: MenuId,
    insert: MenuId,
    update: MenuId,
    json: MenuIdFromString,
  }),
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
      id: MenuId.make(generateUuidBytes()),
      name: input.name,
      days: 7,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  get idString(): string {
    return uuidString(this.id)
  }

  toXml() {
    return Schema.encodeSync(Menu.xml)({ menu: this })
  }
}
