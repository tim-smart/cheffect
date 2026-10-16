import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"
import {
  generateUuidBytes,
  UuidBytes,
  UuidFromString,
  uuidString,
} from "@/lib/Id"

export const MealPlanDayNoteId = UuidBytes("MealPlanDayNoteId")
export type MealPlanDayNoteId = typeof MealPlanDayNoteId.Type
export const MealPlanDayNoteIdFromString = UuidFromString(MealPlanDayNoteId)

export class MealPlanDayNote extends Model.Class<MealPlanDayNote>(
  "MealPlanDayNote",
)({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: MealPlanDayNoteId,
    insert: MealPlanDayNoteId,
    update: MealPlanDayNoteId,
    json: MealPlanDayNoteIdFromString,
  }),
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
      id: MealPlanDayNoteId.make(generateUuidBytes()),
      day: input.day,
      note: input.note,
      createdAt: DateTime.nowUnsafe(),
      updatedAt: DateTime.nowUnsafe(),
    })
  }

  get idString(): string {
    return uuidString(this.id)
  }
}
