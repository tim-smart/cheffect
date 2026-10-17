import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as EventJournal from "effect/eventlog/EventJournal"
import { layerJournal } from "@/EventLog"
import { freshIndexedDb } from "./harness/indexeddb"

// With sync on, every local write is followed by an upload of the entries the
// remote hasn't been sent yet. Finding them has to start after the last upload:
// a scan of the whole journal holds a readwrite transaction on its entries for
// as long as the journal is big, and the next write waits behind it.

const write = (primaryKey: string) =>
  EventJournal.EventJournal.use((journal) =>
    journal.write({
      event: "GroceryItemToggled",
      primaryKey,
      payload: new Uint8Array(),
      effect: () => Effect.void,
    }),
  )

test(
  "an upload sends only the entries written since the last upload",
  {
    todo: "TIM-279: the last uploaded entry is never found, so every upload rescans the journal",
  },
  () => {
    freshIndexedDb()
    return Effect.gen(function* () {
      const journal = yield* EventJournal.EventJournal
      const remoteId = EventJournal.makeRemoteIdUnsafe()
      const upload = journal.withRemoteUncommited(remoteId, (entries) =>
        Effect.succeed(entries.map((entry) => entry.primaryKey)),
      )

      yield* write("milk")
      yield* upload
      yield* write("eggs")

      assert.deepEqual(Option.getOrThrow(yield* upload), ["eggs"])
    }).pipe(Effect.provide(layerJournal), Effect.runPromise)
  },
)
