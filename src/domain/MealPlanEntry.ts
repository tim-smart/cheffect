import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import { UuidBytes, UuidFromString, uuidString } from "@/lib/Id"
import { Recipe } from "./Recipe"
import { UnknownToXml } from "./Xml"

export const MealPlanEntryId = UuidBytes("MealPlanEntryId")
export type MealPlanEntryId = typeof MealPlanEntryId.Type
export const MealPlanEntryIdFromString = UuidFromString(MealPlanEntryId)

// A planned meal joined with its recipe. The stored row keeps `recipeId`
// instead, and the repo joins it with the recipes snapshot.
export class MealPlanEntry extends Model.Class<MealPlanEntry>("MealPlanEntry")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: MealPlanEntryId,
    insert: MealPlanEntryId,
    update: MealPlanEntryId,
    json: MealPlanEntryIdFromString,
  }),
  recipe: Model.Field({
    select: Recipe,
    json: Recipe.json,
  }),
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

  get idString(): string {
    return uuidString(this.id)
  }
}
