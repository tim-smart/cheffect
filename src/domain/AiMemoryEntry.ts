import * as Model from "effect/schema/Model"
import * as Schema from "effect/Schema"
import { UuidBytes, UuidFromString, uuidString } from "@/lib/Id"

export const AiMemoryEntryId = UuidBytes("AiMemoryEntryId")
export type AiMemoryEntryId = typeof AiMemoryEntryId.Type
export const AiMemoryEntryIdFromString = UuidFromString(AiMemoryEntryId)

export class AiMemoryEntry extends Model.Class<AiMemoryEntry>("AiMemoryEntry")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: AiMemoryEntryId,
    insert: AiMemoryEntryId,
    update: AiMemoryEntryId,
    json: AiMemoryEntryIdFromString,
  }),
  content: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(Model.FieldExcept(["update"])),
}) {
  static array = Schema.Array(AiMemoryEntry)

  get idString(): string {
    return uuidString(this.id)
  }
}
