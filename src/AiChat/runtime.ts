import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import type { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { eventLogAtom, writeEvent } from "@/EventLog"
import { AiChatRepo } from "./Repo"

// The repo shares the EventLog runtime's query builder and Reactivity, so
// handler writes reload its snapshots. Kept apart from `AiChatService.ts` so
// Settings can clear, export and import memory without pulling in the chat.
export const aiChatRuntime = Atom.runtime((get) =>
  AiChatRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

// Removes the entries this device can see, so one saved concurrently on
// another device survives (TIM-248).
export const clearAiMemoryAtom = aiChatRuntime.fn<void>()(
  Effect.fnUntraced(function* () {
    const entries = yield* AiChatRepo.use((repo) => repo.memoryEntries)
    const ids = entries.map((entry) => entry.id)
    if (!Array.isArrayNonEmpty(ids)) return
    yield* writeEvent({ event: "AIMemoryEntriesRemoved", payload: { ids } })
  }),
)

// Every memory entry, read when called.
export const exportAiMemoryAtom = aiChatRuntime.fn<void>()(() =>
  AiChatRepo.use((repo) => repo.memoryEntries),
)

// Writes entries as new adds. Ones that already exist are left alone, so
// importing the same file twice changes nothing.
export const importAiMemoryAtom = aiChatRuntime.fn<
  ReadonlyArray<AiMemoryEntry>
>()(
  Effect.fnUntraced(function* (entries) {
    const existing = new Set(
      (yield* AiChatRepo.use((repo) => repo.memoryEntries)).map(
        (entry) => entry.idString,
      ),
    )
    for (const entry of entries) {
      if (existing.has(entry.idString)) continue
      yield* writeEvent({ event: "AIMemoryEntryAdded", payload: entry })
    }
  }),
)
