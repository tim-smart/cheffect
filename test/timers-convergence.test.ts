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
import { CheffectEvents } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { TimersLayer } from "@/Timers"
import { TimerEvents } from "@/Timers/Events"
import { Timer, TimerIdFromString } from "@/domain/Timer"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Timers handlers converge whatever order remote entries arrive in
// (TIM-254): `TimerAdded` creates, `TimerUpdated` patches `expiresAt`,
// `pausedRemaining` and `duration` under last-writer-wins and does nothing
// when the row is missing, and `TimerDeleted` hard-deletes, so a dismissed
// timer can't come back.
//
// As with recipes, the `TimerAdded` is delivered before the permuted entries:
// nothing can update a timer its device hasn't received.

const { TimerAdded, TimerUpdated, TimerDeleted } = TimerEvents.events

const kitchenIdString = "0193c7a0-1b2c-4def-8123-456789abcdef"
const ovenIdString = "0193c7a0-1b2c-4def-8123-fedcba987654"
const kitchen = {
  id: Schema.decodeSync(TimerIdFromString)(kitchenIdString),
  label: "Pasta",
}
const oven = {
  id: Schema.decodeSync(TimerIdFromString)(ovenIdString),
  label: "Bread",
}
type TestTimer = typeof kitchen

const at = (msecs: number) => DateTime.makeUnsafe(msecs)

const added = (timer: TestTimer) =>
  makeEntry({
    msecs: 1000,
    event: TimerAdded,
    payload: Timer.insert.make({
      ...timer,
      duration: Duration.minutes(10),
      expiresAt: at(1000 + Duration.toMillis(Duration.minutes(10))),
      pausedRemaining: null,
      createdAt: at(1000),
      updatedAt: at(1000),
    }),
  })

// A pause, resume or add-time, as the timer list writes it.
const updated = (
  msecs: number,
  timer: TestTimer,
  fields: {
    readonly duration: number
    readonly expiresAt: number
    readonly pausedRemaining: number | null
    readonly updatedAt?: number
  },
) =>
  makeEntry({
    msecs,
    event: TimerUpdated,
    payload: Timer.update.make({
      ...timer,
      duration: Duration.millis(fields.duration),
      expiresAt: at(fields.expiresAt),
      pausedRemaining:
        fields.pausedRemaining === null
          ? null
          : Duration.millis(fields.pausedRemaining),
      updatedAt: at(fields.updatedAt ?? msecs),
    }),
  })

const deleted = (msecs: number, timer: TestTimer) =>
  makeEntry({ msecs, event: TimerDeleted, payload: { id: timer.id } })

const makeLayer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(TimerEvents),
    TimersLayer,
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

const read = Effect.map(readTable("timers"), (timers) => ({ timers }))

const patched = ["duration", "expiresAt", "pausedRemaining"]

test("the Timers group is in the catalogue, keyed by the canonical id string", () => {
  assert.ok(
    (CheffectEvents.groups as ReadonlyArray<unknown>).includes(TimerEvents),
  )
  assert.deepEqual(Object.keys(TimerEvents.events).sort(), [
    "TimerAdded",
    "TimerDeleted",
    "TimerUpdated",
  ])
  for (const entry of [
    added(kitchen),
    updated(2000, kitchen, {
      duration: 600_000,
      expiresAt: 601_000,
      pausedRemaining: null,
    }),
    deleted(2000, kitchen),
  ]) {
    assert.equal(entry.primaryKey, kitchenIdString, entry.event)
  }
})

test("a local whole-Timer update preserves createdAt", async () => {
  const identity = await Effect.runPromise(testIdentity)
  const { timers } = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* remote.deliver([added(kitchen)])
      const log = yield* EventLog.EventLog
      // Pause and add-time hand over a whole Timer, createdAt included.
      yield* log.write({
        schema: EventLog.schema(TimerEvents),
        event: "TimerUpdated",
        payload: new Timer({
          ...kitchen,
          duration: Duration.minutes(10),
          expiresAt: at(601_000),
          pausedRemaining: Duration.minutes(4),
          createdAt: at(2000),
          updatedAt: at(2000),
        }),
      })
      return yield* read
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

test("the newest timer update wins, not the newest updatedAt", async () => {
  const { timers } = await converge({
    layer: makeLayer,
    read,
    setup: [added(kitchen)],
    concurrent: [
      // A pause from a device with its clock ahead.
      updated(2000, kitchen, {
        duration: 600_000,
        expiresAt: 601_000,
        pausedRemaining: 420_000,
        updatedAt: 9000,
      }),
      // Five more minutes from another device.
      updated(3000, kitchen, {
        duration: 900_000,
        expiresAt: 901_000,
        pausedRemaining: null,
      }),
      // A resume that lands between them.
      updated(2500, kitchen, {
        duration: 600_000,
        expiresAt: 662_500,
        pausedRemaining: null,
      }),
    ],
  })
  const timer = only(timers)
  assert.deepEqual(pick(timer, ["label", ...patched]), {
    label: "Pasta",
    duration: 900_000,
    expiresAt: 901_000,
    pausedRemaining: null,
  })
  // Ids are UUID bytes; durations and dates are epoch millis.
  assert.ok(timer.id instanceof Uint8Array)
  assert.equal(timer.id.length, 16)
})

test("a dismissed timer stays dismissed, with updates either side of the delete", async () => {
  const { timers } = await converge({
    layer: makeLayer,
    read,
    setup: [added(kitchen), added(oven)],
    concurrent: [
      updated(2000, kitchen, {
        duration: 600_000,
        expiresAt: 601_000,
        pausedRemaining: 420_000,
      }),
      deleted(3000, kitchen),
      // An update from a device that hadn't seen the dismiss yet.
      updated(4000, kitchen, {
        duration: 900_000,
        expiresAt: 901_000,
        pausedRemaining: null,
      }),
      updated(2500, oven, {
        duration: 600_000,
        expiresAt: 601_000,
        pausedRemaining: 300_000,
      }),
    ],
  })
  assert.deepEqual(pick(only(timers), ["label", ...patched]), {
    label: "Bread",
    duration: 600_000,
    expiresAt: 601_000,
    pausedRemaining: 300_000,
  })
})
