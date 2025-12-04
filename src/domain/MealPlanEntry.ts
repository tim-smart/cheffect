import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"
import { Recipe } from "./Recipe"

export class MealPlanEntry extends Model.Class<MealPlanEntry>("MealPlanEntry")({
  id: Model.GeneratedByApp(Schema.String),
  recipe: Model.JsonFromString(Recipe),
  day: Model.Date,
}) {
  static array = Schema.Array(MealPlanEntry)
}
