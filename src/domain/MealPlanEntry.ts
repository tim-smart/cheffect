import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import { Recipe } from "./Recipe"
import { UnknownToXml } from "./Xml"

export class MealPlanEntry extends Model.Class<MealPlanEntry>("MealPlanEntry")({
  id: Model.GeneratedByApp(Schema.String),
  recipe: Model.JsonFromString(Recipe),
  day: Model.Date,
}) {
  static array = Schema.Array(MealPlanEntry)
  static xml = UnknownToXml.pipe(
    Schema.decodeTo(
      Schema.Array(
        Schema.Struct({
          mealPlanEntry: MealPlanEntry.json,
        }),
      ),
    ),
  )

  static toXml(entries: Iterable<MealPlanEntry>) {
    return Schema.encodeSync(MealPlanEntry.xml)(
      Array.from(entries, (entry) => ({ mealPlanEntry: entry })),
    )
  }
}
