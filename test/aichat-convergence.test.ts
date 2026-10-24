import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Prompt from "effect/ai/Prompt"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { AiChatEvents, AiChatTurnEvent } from "@/AiChat/Events"
import { AiChatLayer } from "@/AiChat/Handlers"
import { AiChatRepo } from "@/AiChat/Repo"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { AiChatTurnIdFromString } from "@/domain/AiChatTurn"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import type { MakeLayer } from "./harness/convergence"

// History is the turns sorted by the time their writer saved them, with the
// turn id as the tiebreak, so every device reads the same conversation
// whatever order the turns arrived in.

const turnEvent = AiChatEvents.events[AiChatTurnEvent.tag]

const turnId = Schema.decodeSync(AiChatTurnIdFromString)
const firstTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000001")
const secondTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000002")
const thirdTurn = turnId("0193c7a0-1b2c-4def-8123-a20000000003")

const PromptJson = Schema.fromJsonString(Schema.toCodecJson(Prompt.Prompt))

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
    }).payload,
  })

const userTexts = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        )
      : [],
  )

const layer: MakeLayer<QueryBuilder | Reactivity.Reactivity> = (
  identity,
  remote,
) => {
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
          Layer.provideMerge(layer(identity, remote.layer)),
        ),
      ),
    )
  }).pipe(Effect.runPromise)
  assert.deepEqual(userTexts(history), ["one", "two", "three"])
})
