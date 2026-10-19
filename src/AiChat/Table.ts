import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { AiChatTurnEvent, AiMemoryEntryEvent } from "./Events"

// Rows are stored as their events write them. Both have random ids, so
// removes hard-delete.

export const AiMemoryEntryRow = AiMemoryEntryEvent.schema
export type AiMemoryEntryRow = typeof AiMemoryEntryRow.Type

export class AiMemoryEntriesTable extends IndexedDbTable.make({
  name: "aiMemoryEntries",
  schema: AiMemoryEntryRow,
  keyPath: "id",
}) {}

export const AiChatTurnRow = AiChatTurnEvent.schema
export type AiChatTurnRow = typeof AiChatTurnRow.Type

export class AiChatTurnsTable extends IndexedDbTable.make({
  name: "aiChatTurns",
  schema: AiChatTurnRow,
  keyPath: "id",
}) {}
