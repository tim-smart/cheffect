import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Prompt from "effect/ai/Prompt"
import { PromptJson } from "@/domain/AiChatTurn"
import { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { uuidString } from "@/lib/Id"
import { makeSnapshot } from "@/lib/Snapshot"
import type { AiChatTurnRow, AiMemoryEntryRow } from "./Table"

// Reads
//
// Memory entries are newest first, as the system prompt lists them. History
// is the turns sorted by entry time, with the id as the tiebreak, joined into
// one prompt. A turn whose JSON no longer decodes is left out rather than
// losing the whole history. `lastTurnAt` is the latest entry time, or none
// for an empty chat.

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const decodeMemory = (
  rows: ReadonlyArray<AiMemoryEntryRow>,
): ReadonlyArray<AiMemoryEntry> =>
  rows
    .map((row) => new AiMemoryEntry(row))
    .sort(
      (a, b) =>
        b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds ||
        compareIds(a.idString, b.idString),
    )

const sortTurns = (
  rows: ReadonlyArray<AiChatTurnRow>,
): ReadonlyArray<AiChatTurnRow> =>
  rows
    .map((row) => ({ row, id: uuidString(row.id) }))
    .sort((a, b) => a.row.entryTime - b.row.entryTime || compareIds(a.id, b.id))
    .map(({ row }) => row)

const decodePrompt = Schema.decodeOption(PromptJson)

const decodeHistory = (rows: ReadonlyArray<AiChatTurnRow>): Prompt.Prompt =>
  sortTurns(rows).reduce(
    (history, row) =>
      Option.match(decodePrompt(row.prompt), {
        onNone: () => history,
        onSome: (turn) => Prompt.concat(history, turn),
      }),
    Prompt.empty,
  )

const latestEntryTime = (
  rows: ReadonlyArray<AiChatTurnRow>,
): number | undefined =>
  rows.length === 0 ? undefined : Math.max(...rows.map((row) => row.entryTime))

const decodeConversation = (rows: ReadonlyArray<AiChatTurnRow>) => ({
  history: decodeHistory(rows),
  lastTurnAt: latestEntryTime(rows),
})

export class AiChatRepo extends Context.Service<AiChatRepo>()(
  "cheffect/AiChat/Repo/AiChatRepo",
  {
    make: Effect.gen(function* () {
      const memory = yield* makeSnapshot("aiMemoryEntries")
      const turns = yield* makeSnapshot("aiChatTurns")
      return {
        memoryEntries: memory.current.pipe(Effect.map(decodeMemory)),
        history: turns.current.pipe(Effect.map(decodeHistory)),
        conversation: turns.current.pipe(Effect.map(decodeConversation)),
        conversationStream: turns.stream.pipe(Stream.map(decodeConversation)),
        // The turns a clear removes: every one this device can see.
        turnIds: turns.current.pipe(
          Effect.map((rows) => rows.map((row) => row.id)),
        ),
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
