import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as EventJournal from "effect/eventlog/EventJournal"
import type * as EventLog from "effect/eventlog/EventLog"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import { databaseName } from "@/IndexedDb"
import { makeFakeRemote, testIdentity } from "./eventlog"
import { readRecords } from "./indexeddb"
import { everyOrder } from "./orders"

// The scenario runner for module convergence tests (TIM-258): real tables and
// handlers, entries through a fake remote, every ordering on a fresh database.

export type Row = Record<string, unknown>

const withoutLww = ({ _lww, ...fields }: Row): Row => fields

// A store's rows as the next page load would read them, ignoring `_lww`.
export const readTable = (store: string) =>
  Effect.gen(function* () {
    const { indexedDB } = yield* IndexedDb.IndexedDb
    const rows = yield* readRecords(indexedDB, databaseName, store)
    return rows.map(withoutLww)
  })

// Builds the layer for one run: the module's EventLog with the given identity,
// and the fake remote registered next to it.
export type MakeLayer = (
  identity: EventLog.Identity["Service"],
  remote: Layer.Layer<never, never, EventLog.Registry>,
) => Layer.Layer<EventLog.EventLog | IndexedDb.IndexedDb, unknown>

const describe = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry) => `${entry.event}@${entry.createdAtMillis}`).join(", ")

// Delivers `setup`, then `concurrent` in every order, and returns the one
// state every ordering agrees on.
export const converge = async <A>(options: {
  readonly layer: MakeLayer
  readonly read: Effect.Effect<A, unknown, IndexedDb.IndexedDb>
  readonly setup?: ReadonlyArray<EventJournal.Entry>
  readonly concurrent: ReadonlyArray<EventJournal.Entry>
}): Promise<A> => {
  const identity = await Effect.runPromise(testIdentity)
  const results: Array<{ readonly order: string; readonly state: A }> = []
  for (const order of everyOrder(options.concurrent)) {
    const state = await Effect.gen(function* () {
      const remote = yield* makeFakeRemote
      return yield* Effect.gen(function* () {
        yield* remote.deliver(options.setup ?? [])
        yield* remote.deliver(order)
        return yield* options.read
      }).pipe(
        // A failing handler stops the replay, and `deliver` would wait forever.
        Effect.timeout("5 seconds"),
        Effect.provide(options.layer(identity, remote.layer)),
      )
    }).pipe(Effect.runPromise)
    results.push({ order: describe(order), state })
  }
  const [first, ...rest] = results
  for (const result of rest) {
    assert.deepStrictEqual(
      result.state,
      first.state,
      `[${result.order}] diverged from [${first.order}]`,
    )
  }
  return first.state
}

export const only = (rows: ReadonlyArray<Row>): Row => {
  assert.equal(rows.length, 1)
  return rows[0]
}

export const pick = (row: Row, keys: ReadonlyArray<string>) =>
  Object.fromEntries(keys.map((key) => [key, row[key]]))
