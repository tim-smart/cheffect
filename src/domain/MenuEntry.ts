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
import { Recipe, RecipeId } from "./Recipe"
import { UnknownToXml } from "./Xml"

export const MenuEntryId = UuidBytes("MenuEntryId")
export type MenuEntryId = typeof MenuEntryId.Type
export const MenuEntryIdFromString = UuidFromString(MenuEntryId)

// A menu's recipe on one of its days, joined with the recipe. The stored row
// keeps `menuId` and `recipeId` instead, and the repo joins it with the
// recipes snapshot.
export class MenuEntry extends Model.Class<MenuEntry>("MenuEntry")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: MenuEntryId,
    insert: MenuEntryId,
    update: MenuEntryId,
    json: MenuEntryIdFromString,
  }),
  menuId: Model.Field({
    insert: MenuId,
  }),
  recipe: Model.Field({
    select: Recipe,
    json: Recipe.json,
  }),
  recipeId: Model.Field({
    insert: RecipeId,
    jsonCreate: Schema.String,
  }),
  day: Schema.Finite,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {
  static array = Schema.Array(MenuEntry)
  static xml = UnknownToXml.pipe(
    Schema.decodeTo(
      Schema.Array(
        Schema.Struct({
          menuEntry: MenuEntry.json,
        }),
      ),
    ),
  )

  static fromForm(
    input: Pick<typeof MenuEntry.insert.Type, "menuId" | "recipeId" | "day">,
  ) {
    return MenuEntry.insert.make({
      id: MenuEntryId.make(generateUuidBytes()),
      menuId: input.menuId,
      recipeId: input.recipeId,
      day: input.day,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  static toXml(entries: ReadonlyArray<MenuEntry>) {
    return Schema.encodeSync(MenuEntry.xml)(
      entries.map((entry) => ({ menuEntry: entry })),
    )
  }

  get idString(): string {
    return uuidString(this.id)
  }
}
