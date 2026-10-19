import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { QueryBuilder } from "@/IndexedDb"
import { tableRowHandler } from "@/lib/rowHandler"
import { AiChatEvents, AiChatTurnEvent, AiMemoryEntryEvent } from "./Events"

// The handlers live here rather than in `src/AiChat.tsx`, which is the chat
// UI.

const AiChatHandlers = EventLog.group(AiChatEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers
      .handle(
        AiMemoryEntryEvent.tag,
        tableRowHandler(db, "aiMemoryEntries", AiMemoryEntryEvent, {
          tableKey: ({ id }) => id,
        }),
      )
      .handle(
        AiChatTurnEvent.tag,
        tableRowHandler(db, "aiChatTurns", AiChatTurnEvent, {
          tableKey: ({ id }) => id,
        }),
      )
  }),
)

const AiChatReactivity = EventLog.groupReactivity(AiChatEvents, {
  [AiMemoryEntryEvent.tag]: ["aiMemoryEntries"],
  [AiChatTurnEvent.tag]: ["aiChatTurns"],
})

export const AiChatLayer = Layer.mergeAll(
  AiChatHandlers,
  AiChatReactivity,
  EventRow.compaction(AiChatEvents, AiMemoryEntryEvent),
  EventRow.compaction(AiChatEvents, AiChatTurnEvent),
)
