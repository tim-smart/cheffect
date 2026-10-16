import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import { AiChatTurnId } from "@/domain/AiChatTurn"
import { AiMemoryEntry, AiMemoryEntryId } from "@/domain/AiMemoryEntry"
import { uuidString } from "@/lib/Id"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays. `v1.AIMemoryClear` is dropped for
// `AIMemoryEntriesRemoved`, which carries the ids the writer saw. Chat
// history moves out of `key_values` into one `AiChatTurnAdded` per finished
// turn, and clearing the chat removes the turns it saw.
export const AiChatEvents = EventGroup.empty
  .add({
    tag: "AIMemoryEntryAdded",
    primaryKey: (entry) => uuidString(entry.id),
    payload: AiMemoryEntry.insert,
  })
  .add({
    tag: "AIMemoryEntryRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: AiMemoryEntryId }),
  })
  .add({
    tag: "AIMemoryEntriesRemoved",
    // A fixed key per table, as for `GroceryItemsDeleted`.
    primaryKey: () => "aiMemoryEntries",
    payload: Schema.Struct({ ids: Schema.NonEmptyArray(AiMemoryEntryId) }),
  })
  .add({
    tag: "AiChatTurnAdded",
    primaryKey: ({ id }) => uuidString(id),
    // `prompt` is the turn's messages as `PromptJson`.
    payload: Schema.Struct({ id: AiChatTurnId, prompt: Schema.String }),
  })
  .add({
    tag: "AiChatTurnsRemoved",
    primaryKey: () => "aiChatTurns",
    payload: Schema.Struct({ ids: Schema.NonEmptyArray(AiChatTurnId) }),
  })
