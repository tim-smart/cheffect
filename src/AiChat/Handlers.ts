import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { QueryBuilder } from "@/IndexedDb"
import * as Compaction from "@/lib/Compaction"
import { eventFields } from "@/lib/eventFields"
import { uuidString } from "@/lib/Id"
import { AiChatEvents } from "./Events"

// Handlers converge whatever order remote entries arrive in: an add inserts
// only when the row is missing, and a remove hard-deletes. A clear deletes
// only the ids its writer saw, so a memory
// entry or turn added concurrently on another device survives it.
//
// The handlers live here rather than in `src/AiChat.tsx`, which is the chat
// UI.

const memoryFields = eventFields(AiMemoryEntry.insert)

const AiChatHandlers = EventLog.group(AiChatEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const memory = db.from("aiMemoryEntries")
    const turns = db.from("aiChatTurns")

    return handlers
      .handle("AIMemoryEntryAdded", ({ payload }) =>
        Effect.gen(function* () {
          const [row] = yield* memory.select().equals(payload.id).limit(1)
          if (row !== undefined) return
          yield* memory.insert(memoryFields(payload))
        }).pipe(Effect.orDie),
      )
      .handle("AIMemoryEntryRemove", ({ payload }) =>
        memory.delete().equals(payload.id).pipe(Effect.orDie),
      )
      .handle("AIMemoryEntriesRemoved", ({ payload }) =>
        Effect.forEach(payload.ids, (id) => memory.delete().equals(id), {
          discard: true,
        }).pipe(
          db.withTransaction({
            tables: ["aiMemoryEntries"],
            mode: "readwrite",
          }),
          Effect.orDie,
        ),
      )
      .handle("AiChatTurnAdded", ({ payload, entry }) =>
        Effect.gen(function* () {
          const [row] = yield* turns.select().equals(payload.id).limit(1)
          if (row !== undefined) return
          yield* turns.insert({
            id: payload.id,
            prompt: payload.prompt,
            entryTime: entry.createdAtMillis,
          })
        }).pipe(Effect.orDie),
      )
      .handle("AiChatTurnsRemoved", ({ payload }) =>
        Effect.forEach(payload.ids, (id) => turns.delete().equals(id), {
          discard: true,
        }).pipe(
          db.withTransaction({ tables: ["aiChatTurns"], mode: "readwrite" }),
          Effect.orDie,
        ),
      )
  }),
)

const AiChatReactivity = EventLog.groupReactivity(AiChatEvents, {
  AIMemoryEntryAdded: ["aiMemoryEntries"],
  AIMemoryEntryRemove: ["aiMemoryEntries"],
  AIMemoryEntriesRemoved: ["aiMemoryEntries"],
  AiChatTurnAdded: ["aiChatTurns"],
  AiChatTurnsRemoved: ["aiChatTurns"],
})

// Nothing here overwrites a row, so the only entries skipped are those for
// rows a later remove deletes.
const AiChatCompaction = Compaction.layer(AiChatEvents, {
  AIMemoryEntryAdded: () => Compaction.create("aiMemoryEntries"),
  AIMemoryEntryRemove: ({ id }) =>
    Compaction.remove("aiMemoryEntries", [uuidString(id)]),
  AIMemoryEntriesRemoved: ({ ids }) =>
    Compaction.remove("aiMemoryEntries", ids.map(uuidString)),
  AiChatTurnAdded: () => Compaction.create("aiChatTurns"),
  AiChatTurnsRemoved: ({ ids }) =>
    Compaction.remove("aiChatTurns", ids.map(uuidString)),
})

export const AiChatLayer = Layer.mergeAll(
  AiChatHandlers,
  AiChatReactivity,
  AiChatCompaction,
)
