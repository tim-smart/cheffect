import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { TimersLayer } from "@/Timers"
import { TimerEvents } from "@/Timers/Events"
import { Timer, TimerIdFromString } from "@/domain/Timer"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import { only, pick, readTable } from "./harness/convergence"

// Pause and add-time hand `TimerUpdated` a whole Timer, createdAt included.
// The handler patches only the running state.

const schema = EventLog.schema(TimerEvents)

const timer = {
  id: Schema.decodeSync(TimerIdFromString)(
    "0193c7a0-1b2c-4def-8123-456789abcdef",
  ),
  label: "Pasta",
  duration: Duration.minutes(10),
  expiresAt: DateTime.makeUnsafe(601_000),
}

const added = makeEntry({
  msecs: 1000,
  event: TimerEvents.events.TimerAdded,
  payload: Timer.insert.make({
    ...timer,
    pausedRemaining: null,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
  }),
})

const makeLayer = (
  identity: EventLog.Identity["Service"],
  remote: Layer.Layer<never, never, EventLog.Registry>,
) => {
  const eventLog = EventLog.layer(schema, TimersLayer).pipe(
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

test("a local whole-Timer update pauses the timer and preserves createdAt", async () => {
  const identity = await Effect.runPromise(testIdentity)
  const timers = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* remote.deliver([added])
      const log = yield* EventLog.EventLog
      yield* log.write({
        schema,
        event: "TimerUpdated",
        payload: new Timer({
          ...timer,
          pausedRemaining: Duration.minutes(4),
          createdAt: DateTime.makeUnsafe(2000),
          updatedAt: DateTime.makeUnsafe(2000),
        }),
      })
      return yield* readTable("timers")
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.provide(makeLayer(identity, remote.layer)),
    )
  }).pipe(Effect.runPromise)
  assert.deepEqual(pick(only(timers), ["createdAt", "pausedRemaining"]), {
    createdAt: 1000,
    pausedRemaining: 240_000,
  })
})
