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
import { AiChatEvents } from "@/AiChat/Events"
import { AiChatLayer } from "@/AiChat/Handlers"
import { AiChatRepo } from "@/AiChat/Repo"
import { CheffectEvents } from "@/EventLog"
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
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The AiChat handlers converge whatever order remote entries arrive in
// (TIM-248, TIM-254): `AIMemoryEntryAdded` and `AiChatTurnAdded` create,
// `AIMemoryEntryRemove` hard-deletes, and the two bulk removes hard-delete
// only the ids their writer saw, so a memory entry or chat turn added
// concurrently on another device survives the clear.
//
// History is the turns sorted by entry time, with the turn id as the
// tiebreak, so every device reads the same conversation.
//
// The first add of a row is delivered before the permuted entries: nothing
// can remove a row its device hasn't received.

const {
  AIMemoryEntryAdded,
  AIMemoryEntryRemove,
  AIMemoryEntriesRemoved,
  AiChatTurnAdded,
  AiChatTurnsRemoved,
} = AiChatEvents.events

const memoryId = Schema.decodeSync(AiMemoryEntryIdFromString)
const peanutsIdString = "0193c7a0-1b2c-4def-8123-a10000000001"
const peanuts = memoryId(peanutsIdString)
const fanOven = memoryId("0193c7a0-1b2c-4def-8123-a10000000002")
const metric = memoryId("0193c7a0-1b2c-4def-8123-a10000000003")
type MemoryId = typeof peanuts

const turnId = Schema.decodeSync(AiChatTurnIdFromString)
const firstTurnIdString = "0193c7a0-1b2c-4def-8123-a20000000001"
const firstTurn = turnId(firstTurnIdString)
const secondTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000002")
const thirdTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000003")
const fourthTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000004")
type TurnId = typeof firstTurn

const PromptJson = Schema.fromJsonString(Schema.toCodecJson(Prompt.Prompt))

// A turn holding a single user message, so history order reads off the text.
const promptJson = (text: string) =>
  Schema.encodeSync(PromptJson)(Prompt.make(text))

const userTexts = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        )
      : [],
  )

const memoryAdded = (msecs: number, id: MemoryId, content: string) =>
  makeEntry({
    msecs,
    event: AIMemoryEntryAdded,
    payload: AiMemoryEntry.insert.make({
      id,
      content,
      createdAt: DateTime.makeUnsafe(msecs),
    }),
  })

const memoryRemoved = (msecs: number, id: MemoryId) =>
  makeEntry({ msecs, event: AIMemoryEntryRemove, payload: { id } })

const memoriesRemoved = (
  msecs: number,
  ids: readonly [MemoryId, ...Array<MemoryId>],
) => makeEntry({ msecs, event: AIMemoryEntriesRemoved, payload: { ids } })

const turnAdded = (msecs: number, id: TurnId, text: string) =>
  makeEntry({
    msecs,
    event: AiChatTurnAdded,
    payload: { id, prompt: promptJson(text) },
  })

const turnsRemoved = (
  msecs: number,
  ids: readonly [TurnId, ...Array<TurnId>],
) => makeEntry({ msecs, event: AiChatTurnsRemoved, payload: { ids } })

const makeLayer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(AiChatEvents),
    AiChatLayer,
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

test("the AiChat group is in the catalogue, keyed by the id string or a fixed key per table", () => {
  assert.ok(
    (CheffectEvents.groups as ReadonlyArray<unknown>).includes(AiChatEvents),
  )
  assert.deepEqual(Object.keys(AiChatEvents.events).sort(), [
    "AIMemoryEntriesRemoved",
    "AIMemoryEntryAdded",
    "AIMemoryEntryRemove",
    "AiChatTurnAdded",
    "AiChatTurnsRemoved",
  ])
  assert.equal(
    memoryAdded(1000, peanuts, "Allergic to peanuts").primaryKey,
    peanutsIdString,
  )
  assert.equal(memoryRemoved(1000, peanuts).primaryKey, peanutsIdString)
  assert.equal(turnAdded(1000, firstTurn, "Hi").primaryKey, firstTurnIdString)
  // Every clear of a table shares one fixed key.
  assert.equal(
    memoriesRemoved(1000, [peanuts, fanOven]).primaryKey,
    "aiMemoryEntries",
  )
  assert.equal(
    turnsRemoved(1000, [firstTurn, secondTurn]).primaryKey,
    "aiChatTurns",
  )
})

test("a memory clear deletes the entries it saw and none added concurrently, whatever arrives first", async () => {
  const { aiMemoryEntries } = await converge({
    layer: makeLayer,
    read,
    setup: [
      memoryAdded(1000, peanuts, "Allergic to peanuts"),
      memoryAdded(1000, fanOven, "Has a fan oven"),
    ],
    concurrent: [
      memoryRemoved(2000, peanuts),
      // Added on another device before the clear, but never seen by it.
      memoryAdded(2500, metric, "Prefers metric units"),
      // From a device that hadn't seen the remove yet.
      memoriesRemoved(3000, [peanuts, fanOven]),
    ],
  })
  assert.deepEqual(pick(only(aiMemoryEntries), ["id", "content"]), {
    id: metric,
    content: "Prefers metric units",
  })
})

test("clearing the chat deletes the turns it saw and none added concurrently, whatever arrives first", async () => {
  const { aiChatTurns } = await converge({
    layer: makeLayer,
    read,
    setup: [
      turnAdded(1000, firstTurn, "one"),
      turnAdded(1500, secondTurn, "two"),
    ],
    concurrent: [
      // A turn on another device that the clear never saw.
      turnAdded(2500, thirdTurn, "three"),
      turnsRemoved(3000, [firstTurn, secondTurn]),
      // The clearing device chats again.
      turnAdded(4000, fourthTurn, "four"),
    ],
  })
  // The prompt is stored as the JSON string it was written with.
  assert.deepEqual(
    aiChatTurns.map((row) => pick(row, ["id", "prompt"])),
    [
      { id: thirdTurn, prompt: promptJson("three") },
      { id: fourthTurn, prompt: promptJson("four") },
    ],
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
      const repo = yield* AiChatRepo
      return yield* repo.history
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.provide(
        AiChatRepo.layer.pipe(
          Layer.provideMerge(makeLayer(identity, remote.layer)),
        ),
      ),
    )
  }).pipe(Effect.runPromise)
  assert.deepEqual(userTexts(history), ["one", "two", "three"])
})
