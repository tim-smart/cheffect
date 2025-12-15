import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { Recipe } from "./Recipe"
import * as DateTime from "effect/DateTime"

export class MenuEntry extends Model.Class<MenuEntry>("MenuEntry")({
  id: Model.GeneratedByApp(Schema.String),
  menuId: Model.Field({
    insert: Schema.String,
  }),
  recipe: Model.Field({
    select: Schema.parseJson(Recipe),
  }),
  recipeId: Model.Field({
    insert: Schema.String,
  }),
  day: Schema.Number,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(Model.FieldExcept("update")),
  updatedAt: Schema.DateTimeUtcFromNumber,
}) {
  static array = Schema.Array(MenuEntry)

  static fromForm(
    input: Pick<typeof MenuEntry.insert.Type, "menuId" | "recipeId" | "day">,
  ) {
    return MenuEntry.insert.make({
      id: crypto.randomUUID(),
      menuId: input.menuId,
      recipeId: input.recipeId,
      day: input.day,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
  }
}
