import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"

export class AiMemoryEntry extends Model.Class<AiMemoryEntry>("AiMemoryEntry")({
  id: Model.GeneratedByApp(Schema.String),
  content: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(Model.FieldExcept(["update"])),
}) {
  static array = Schema.Array(AiMemoryEntry)
}
