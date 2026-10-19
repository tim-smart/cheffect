import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import { AiChatTurnId } from "@/domain/AiChatTurn"
import { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { uuidKey } from "@/lib/Id"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed.
//
// Clearing memory or the chat removes each row the writer saw, so one added
// concurrently on another device survives.
export const AiMemoryEntryEvent = EventRow.make("AiMemoryEntry", {
  key: uuidKey,
  schema: Schema.Struct(AiMemoryEntry.fields),
})

// `prompt` is the turn's messages as `PromptJson`. `entryTime` is when the
// writer saved the turn, in epoch millis. History sorts by it, with the id as
// the tiebreak, so every device reads the turns in the same order.
export const AiChatTurnEvent = EventRow.make("AiChatTurn", {
  key: uuidKey,
  schema: Schema.Struct({
    id: AiChatTurnId,
    prompt: Schema.String,
    entryTime: Schema.Number,
  }),
})

export const AiChatEvents = EventGroup.empty
  .add(AiMemoryEntryEvent)
  .add(AiChatTurnEvent)
