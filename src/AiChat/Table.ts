import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { AiChatTurnId } from "@/domain/AiChatTurn"
import { AiMemoryEntry } from "@/domain/AiMemoryEntry"

// Memory entries and chat turns are only ever added and removed, never
// updated, so their rows carry no last-writer-wins stamps. Both have random
// ids, so removes hard-delete.

export const AiMemoryEntryRow = Schema.Struct(AiMemoryEntry.fields)
export type AiMemoryEntryRow = typeof AiMemoryEntryRow.Type

export class AiMemoryEntriesTable extends IndexedDbTable.make({
  name: "aiMemoryEntries",
  schema: AiMemoryEntryRow,
  keyPath: "id",
}) {}

// `entryTime` is the adding entry's time in epoch millis. History sorts by
// it, with the id as the tiebreak, so every device reads the turns in the
// same order.
export const AiChatTurnRow = Schema.Struct({
  id: AiChatTurnId,
  prompt: Schema.String,
  entryTime: Schema.Number,
})
export type AiChatTurnRow = typeof AiChatTurnRow.Type

export class AiChatTurnsTable extends IndexedDbTable.make({
  name: "aiChatTurns",
  schema: AiChatTurnRow,
  keyPath: "id",
}) {}
