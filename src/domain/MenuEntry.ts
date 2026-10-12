import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import { Recipe } from "./Recipe"
import * as DateTime from "effect/DateTime"
import { UnknownToXml } from "./Xml"

export class MenuEntry extends Model.Class<MenuEntry>("MenuEntry")({
  id: Model.GeneratedByApp(Schema.String),
  menuId: Model.Field({
    insert: Schema.String,
  }),
  recipe: Model.Field({
    select: Schema.fromJsonString(Recipe),
    json: Recipe,
  }),
  recipeId: Model.Field({
    insert: Schema.String,
    jsonCreate: Schema.String,
  }),
  day: Schema.Number,
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
          menuEntry: Schema.Struct({
            ...MenuEntry.json.fields,
            recipe: Recipe.json,
          }),
        }),
      ),
    ),
  )

  static fromForm(
    input: Pick<typeof MenuEntry.insert.Type, "menuId" | "recipeId" | "day">,
  ) {
    return MenuEntry.insert.make({
      id: crypto.randomUUID(),
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
}
