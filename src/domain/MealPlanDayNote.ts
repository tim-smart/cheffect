import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"

export class MealPlanDayNote extends Model.Class<MealPlanDayNote>(
  "MealPlanDayNote",
)({
  id: Model.GeneratedByApp(Schema.String),
  day: Model.Date,
  note: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {
  static array = Schema.Array(MealPlanDayNote)

  static fromForm(
    input: Pick<MealPlanDayNote, "day" | "note">,
  ): MealPlanDayNote {
    return new MealPlanDayNote({
      id: crypto.randomUUID(),
      day: input.day,
      note: input.note,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }
}
