import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import * as IndexedDbVersion from "@effect/platform-browser/IndexedDbVersion"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import { everyOrder } from "./harness/orders"

// Checks the convergence harness itself, with a stand-in module: one table,
// one event and a whole-row last-writer-wins handler keyed on entry time.
// Module stages reuse the harness with their real tables and handlers.

const NoteRow = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  writtenAt: Schema.Number,
})
class NotesTable extends IndexedDbTable.make({
  name: "notes",
  schema: NoteRow,
  keyPath: "id",
}) {}
class V1 extends IndexedDbVersion.make(NotesTable) {}
class Database extends IndexedDbDatabase.make(
  V1,
  Effect.fn(function* (api) {
    yield* api.createObjectStore("notes")
  }),
) {}

const NoteEvents = EventGroup.empty.add({
  tag: "NoteSet",
  primaryKey: (payload) => payload.id,
  payload: Schema.Struct({ id: Schema.String, text: Schema.String }),
})
const NoteSet = NoteEvents.events.NoteSet
const TestEvents = EventLog.schema(NoteEvents)

const NoteHandlers = EventLog.group(NoteEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* Database
    return handlers.handle("NoteSet", ({ payload, entry }) =>
      Effect.gen(function* () {
        const notes = db.from("notes")
        const existing = yield* notes
          .select()
          .equals(payload.id)
          .first()
          .pipe(Effect.option)
        if (
          Option.isSome(existing) &&
          existing.value.writtenAt > entry.createdAtMillis
        ) {
          return
        }
        yield* notes.upsert({
          id: payload.id,
          text: payload.text,
          writtenAt: entry.createdAtMillis,
        })
      }),
    )
  }),
)

const makeLayer = (
  identity: EventLog.Identity["Service"],
  remote: Layer.Layer<never, never, EventLog.Registry>,
) => {
  const eventLog = EventLog.layer(
    TestEvents,
    Layer.mergeAll(
      NoteHandlers,
      EventLog.groupReactivity(NoteEvents, { NoteSet: ["notes"] }),
    ),
  ).pipe(
    Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
  )
  return Layer.mergeAll(eventLog, remote.pipe(Layer.provide(eventLog))).pipe(
    Layer.provideMerge(Database.layer("test")),
    Layer.provideMerge(Reactivity.layer),
    Layer.provide(layerFreshIndexedDb),
  )
}

const readNotes = Effect.gen(function* () {
  const db = yield* Database
  const rows = yield* db.from("notes").select()
  return rows.map(({ id, text }) => ({ id, text }))
})

// Runs one scenario order on a fresh database and returns the notes table.
const run = (
  identity: EventLog.Identity["Service"],
  entries: ReadonlyArray<EventJournal.Entry>,
) =>
  Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* remote
      .deliver(entries)
      .pipe(
        Effect.andThen(readNotes),
        Effect.provide(makeLayer(identity, remote.layer)),
      )
  }).pipe(Effect.runPromise)

test("entries delivered through the fake remote converge in every order", async () => {
  const identity = await Effect.runPromise(testIdentity)
  const entries = [
    makeEntry({
      msecs: 1000,
      event: NoteSet,
      payload: { id: "n1", text: "a" },
    }),
    makeEntry({
      msecs: 2000,
      event: NoteSet,
      payload: { id: "n1", text: "b" },
    }),
    makeEntry({
      msecs: 3000,
      event: NoteSet,
      payload: { id: "n1", text: "c" },
    }),
  ]
  const orders = everyOrder(entries)
  assert.equal(orders.length, 6)
  for (const order of orders) {
    assert.deepEqual(await run(identity, order), [{ id: "n1", text: "c" }])
  }
})

test("every run starts from an empty database", async () => {
  const identity = await Effect.runPromise(testIdentity)
  await run(identity, [
    makeEntry({
      msecs: 1000,
      event: NoteSet,
      payload: { id: "n1", text: "a" },
    }),
  ])
  assert.deepEqual(await run(identity, []), [])
})

test("a remote entry invalidates the table key registered with groupReactivity", async () => {
  const identity = await Effect.runPromise(testIdentity)
  const seen = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      const notes = yield* Reactivity.query(readNotes, ["notes"])
      const before = yield* Queue.take(notes)
      yield* remote.deliver([
        makeEntry({
          msecs: 1000,
          event: NoteSet,
          payload: { id: "n1", text: "a" },
        }),
      ])
      const after = yield* Queue.take(notes)
      return { before, after }
    }).pipe(Effect.scoped, Effect.provide(makeLayer(identity, remote.layer)))
  }).pipe(Effect.runPromise)
  assert.deepEqual(seen, { before: [], after: [{ id: "n1", text: "a" }] })
})
