import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Prompt from "effect/ai/Prompt"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import {
  AiChatEvents,
  AiChatTurnEvent,
  AiMemoryEntryEvent,
} from "@/AiChat/Events"
import { AiChatLayer } from "@/AiChat/Handlers"
import { AiChatRepo } from "@/AiChat/Repo"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { AiChatTurnIdFromString } from "@/domain/AiChatTurn"
import {
  AiMemoryEntry,
  AiMemoryEntryIdFromString,
} from "@/domain/AiMemoryEntry"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  pick,
  readTable,
  withoutCompaction,
} from "./harness/convergence"

// The two AI clears remove only the rows their writer saw, so a memory entry
// or chat turn added concurrently on another device survives. History is the
// turns sorted by the time their writer saved them, with the turn id as the
// tiebreak, so every device reads the same conversation whatever order the
// turns arrived in.

const memoryEvent = AiChatEvents.events[AiMemoryEntryEvent.tag]
const turnEvent = AiChatEvents.events[AiChatTurnEvent.tag]

const memoryId = Schema.decodeSync(AiMemoryEntryIdFromString)
const peanuts = memoryId("0193c7a0-1b2c-4def-8123-a10000000001")
const metric = memoryId("0193c7a0-1b2c-4def-8123-a10000000002")

const turnId = Schema.decodeSync(AiChatTurnIdFromString)
const firstTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000001")
const secondTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000002")
const thirdTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000003")

const PromptJson = Schema.fromJsonString(Schema.toCodecJson(Prompt.Prompt))

const memoryAdded = (msecs: number, id: typeof peanuts, content: string) =>
  makeEntry({
    msecs,
    event: memoryEvent,
    payload: AiMemoryEntryEvent.set(
      AiMemoryEntry.insert.make({
        id,
        content,
        createdAt: DateTime.makeUnsafe(msecs),
      }),
    ),
  })

const memoryRemoved = (msecs: number, id: typeof peanuts) =>
  makeEntry({
    msecs,
    event: memoryEvent,
    payload: AiMemoryEntryEvent.remove(AiMemoryEntryEvent.keyOf({ id })),
  })

// A turn holding a single user message, so history order reads off the text,
// saved at `msecs`.
const turnAdded = (msecs: number, id: typeof firstTurn, text: string) =>
  makeEntry({
    msecs,
    event: turnEvent,
    payload: AiChatTurnEvent.set({
      id,
      prompt: Schema.encodeSync(PromptJson)(Prompt.make(text)),
      entryTime: msecs,
    }),
  })

const turnRemoved = (msecs: number, id: typeof firstTurn) =>
  makeEntry({
    msecs,
    event: turnEvent,
    payload: AiChatTurnEvent.remove(AiChatTurnEvent.keyOf({ id })),
  })

const userTexts = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        )
      : [],
  )

const makeLayer =
  (
    handlers: typeof AiChatLayer,
  ): MakeLayer<QueryBuilder | Reactivity.Reactivity> =>
  (identity, remote) => {
    const eventLog = EventLog.layer(
      EventLog.schema(AiChatEvents),
      handlers,
    ).pipe(
      Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
      Layer.provide(Layer.succeed(EventLog.Identity, identity)),
    )
    return Layer.mergeAll(eventLog, remote.pipe(Layer.provide(eventLog))).pipe(
      Layer.provideMerge(QueryBuilder.layer),
      Layer.provideMerge(layerDatabase),
      Layer.provideMerge(Reactivity.layer),
      Layer.provideMerge(layerFreshIndexedDb),
    )
  }

const read = Effect.gen(function* () {
  return {
    aiMemoryEntries: yield* readTable("aiMemoryEntries"),
    aiChatTurns: yield* readTable("aiChatTurns"),
  }
})

test("each AI clear deletes the rows it saw and none added concurrently, whatever arrives first", async () => {
  const state = await converge({
    layer: makeLayer(AiChatLayer),
    uncompacted: makeLayer(withoutCompaction(AiChatLayer)),
    read,
    setup: [
      memoryAdded(1000, peanuts, "Allergic to peanuts"),
      turnAdded(1000, firstTurn, "one"),
    ],
    concurrent: [
      memoryRemoved(3000, peanuts),
      // Added on another device before the clears, but never seen by them.
      memoryAdded(2500, metric, "Prefers metric units"),
      turnRemoved(3000, firstTurn),
      turnAdded(2500, secondTurn, "two"),
    ],
  })
  assert.deepEqual(
    state.aiMemoryEntries.map((row) => pick(row, ["id"])),
    [{ id: metric }],
  )
  assert.deepEqual(
    state.aiChatTurns.map((row) => pick(row, ["id"])),
    [{ id: secondTurn }],
  )
})

test("history is the turns in entry-time order, with the turn id breaking ties", async () => {
  const identity = await Effect.runPromise(testIdentity)
  const history = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      // Neither arrival order nor id order matches entry-time order.
      yield* remote.deliver([
        turnAdded(2000, secondTurn, "three"),
        turnAdded(2000, firstTurn, "two"),
        turnAdded(1000, thirdTurn, "one"),
      ])
      return yield* AiChatRepo.use((repo) => repo.history)
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.provide(
        AiChatRepo.layer.pipe(
          Layer.provideMerge(makeLayer(AiChatLayer)(identity, remote.layer)),
        ),
      ),
    )
  }).pipe(Effect.runPromise)
  assert.deepEqual(userTexts(history), ["one", "two", "three"])
})
