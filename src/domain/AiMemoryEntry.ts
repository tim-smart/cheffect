import { Model } from "@effect/sql"
import * as Schema from "effect/Schema"

export class AiMemoryEntry extends Model.Class<AiMemoryEntry>("AiMemoryEntry")({
  id: Model.GeneratedByApp(Schema.String),
  content: Schema.String,
  createdAt: Schema.DateTimeUtcFromNumber.pipe(Model.FieldExcept("update")),
}) {
  static array = Schema.Array(AiMemoryEntry)
}
