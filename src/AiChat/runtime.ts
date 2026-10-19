import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import { eventLogAtom, writeEvents } from "@/EventLog"
import { AiMemoryEntryEvent } from "./Events"
import { AiChatRepo } from "./Repo"

// The repo shares the EventLog runtime's query builder and Reactivity, so
// handler writes reload its snapshots. Kept apart from `AiChatService.ts` so
// Settings can clear memory without pulling in the chat.
export const aiChatRuntime = Atom.runtime((get) =>
  AiChatRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

// Removes the entries this device can see, so one saved concurrently on
// another device survives.
export const clearAiMemoryAtom = aiChatRuntime.fn<void>()(
  Effect.fnUntraced(function* () {
    const entries = yield* AiChatRepo.use((repo) => repo.memoryEntries)
    yield* writeEvents(
      entries.map((entry) => AiMemoryEntryEvent.remove({ id: entry.id })),
    )
  }),
)
