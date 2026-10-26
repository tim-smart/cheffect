import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Prompt from "effect/ai/Prompt"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { AiChatEvents, AiChatTurnEvent } from "@/AiChat/Events"
import { AiChatLayer } from "@/AiChat/Handlers"
import { isInactive, resumeTurn } from "@/AiChat/Inactivity"
import { AiChatRepo } from "@/AiChat/Repo"
import { layerHandlerTransaction, layerJournal, writeEvent } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { AiChatTurnIdFromString, PromptJson } from "@/domain/AiChatTurn"
import {
  type FakeRemote,
  makeEntry,
  makeFakeRemote,
  testIdentity,
} from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// A chat goes inactive an hour after its latest turn, from any device. A
// message sent to an inactive chat starts a fresh one; resuming first saves a
// turn with no messages, so the chat continues on every device.

const minute = 60 * 1000
const lastTurnAt = Date.UTC(2026, 9, 26, 9, 0)

test("a chat goes inactive once an hour has passed since its latest turn", () => {
  assert.equal(isInactive(lastTurnAt, lastTurnAt + 60 * minute - 1), false)
  assert.equal(isInactive(lastTurnAt, lastTurnAt + 60 * minute), true)
  // An empty chat has nothing to set aside.
  assert.equal(isInactive(undefined, lastTurnAt + 600 * minute), false)
})

const device = (remote: FakeRemote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(AiChatEvents),
    AiChatLayer,
  ).pipe(
    Layer.provideMerge(layerJournal),
    Layer.provide(layerHandlerTransaction),
    Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  )
  return AiChatRepo.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(eventLog, remote.layer.pipe(Layer.provide(eventLog))),
    ),
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
}

// The chat both devices start with: one turn, saved three hours before the
// resume.
const earlierTurn = makeEntry({
  msecs: lastTurnAt,
  event: AiChatEvents.events[AiChatTurnEvent.tag],
  payload: AiChatTurnEvent.set({
    id: Schema.decodeSync(AiChatTurnIdFromString)(
      "0193c7a0-1b2c-4def-8123-a20000000001",
    ),
    prompt: Schema.encodeSync(PromptJson)(Prompt.make("hello")),
    entryTime: lastTurnAt,
  }).payload,
})

test("resuming on one device brings the chat back on another", async () => {
  const resumedAt = lastTurnAt + 3 * 60 * minute
  const sentAt = resumedAt + minute

  const result = await Effect.gen(function* () {
    // The resuming device: its write is what the remote passes on.
    const remoteA = yield* makeFakeRemote
    const resume = yield* Effect.gen(function* () {
      yield* remoteA.deliver([earlierTurn])
      yield* writeEvent(resumeTurn(resumedAt))
      while (true) {
        const uploaded = yield* remoteA.uploaded
        if (uploaded.length > 0) return uploaded
        yield* Effect.sleep("2 millis")
      }
    }).pipe(Effect.timeout("5 seconds"), Effect.provide(device(remoteA)))

    const remoteB = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* remoteB.deliver([earlierTurn])
      const before = yield* AiChatRepo.use((repo) => repo.conversation)
      yield* remoteB.deliver(resume)
      // What the chat on this device sees next, as it follows the stream.
      const after = yield* AiChatRepo.use((repo) =>
        repo.conversationStream.pipe(
          Stream.filter((next) => next.lastTurnAt !== before.lastTurnAt),
          Stream.runHead,
        ),
      )
      return { before, after: Option.getOrThrow(after) }
    }).pipe(Effect.timeout("5 seconds"), Effect.provide(device(remoteB)))
  }).pipe(Effect.runPromise)

  assert.equal(isInactive(result.before.lastTurnAt, sentAt), true)
  assert.equal(isInactive(result.after.lastTurnAt, sentAt), false)
  // The resume adds nothing to the conversation itself.
  assert.deepEqual(result.after.history, result.before.history)
})
