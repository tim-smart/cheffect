import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import { databaseName } from "@/IndexedDb"
import { makeFakeRemote, testIdentity } from "./eventlog"
import { readRecords } from "./indexeddb"
import { everyOrder } from "./orders"

// The scenario runner for module convergence tests: real tables and
// handlers, entries through a fake remote, every ordering on a fresh database.

export type Row = Record<string, unknown>

// A store's rows as the next page load would read them.
export const readTable = (store: string) =>
  Effect.gen(function* () {
    const { indexedDB } = yield* IndexedDb.IndexedDb
    return yield* readRecords(indexedDB, databaseName, store)
  })

// Builds the layer for one run: the module's EventLog with the given identity,
// and the fake remote registered next to it. `R` is anything else `read` needs.
export type MakeLayer<R = never> = (
  identity: EventLog.Identity["Service"],
  remote: Layer.Layer<never, never, EventLog.Registry>,
) => Layer.Layer<EventLog.EventLog | IndexedDb.IndexedDb | R, unknown>

// The module's handlers with the compactors it registers left out, so a
// remote batch replays every entry.
export const withoutCompaction = <A, E, R>(
  handlers: Layer.Layer<A, E, R>,
): Layer.Layer<A, E, R | EventLog.Registry> =>
  handlers.pipe(
    Layer.provide(
      Layer.effect(
        EventLog.Registry,
        EventLog.Registry.useSync((registry) =>
          EventLog.Registry.of({
            ...registry,
            registerCompaction: () => Effect.void,
          }),
        ),
      ),
    ),
  )

const describe = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry) => `${entry.event}@${entry.createdAtMillis}`).join(", ")

// Delivers `setup`, then `concurrent` in every order, and returns the one
// state every ordering agrees on. With `uncompacted`, each order is also
// replayed as one batch through it and one entry per batch through `layer`.
export const converge = async <A, R = never>(options: {
  readonly layer: MakeLayer<R>
  readonly uncompacted?: MakeLayer<R>
  readonly read: Effect.Effect<A, unknown, IndexedDb.IndexedDb | R>
  readonly setup?: ReadonlyArray<EventJournal.Entry>
  readonly concurrent: ReadonlyArray<EventJournal.Entry>
}): Promise<A> => {
  const identity = await Effect.runPromise(testIdentity)
  const replay = (
    layer: MakeLayer<R>,
    batches: ReadonlyArray<ReadonlyArray<EventJournal.Entry>>,
  ) =>
    Effect.gen(function* () {
      const remote = yield* makeFakeRemote
      return yield* Effect.gen(function* () {
        yield* remote.deliver(options.setup ?? [])
        for (const batch of batches) yield* remote.deliver(batch)
        return yield* options.read
      }).pipe(
        // A failing handler stops the replay, and `deliver` would wait forever.
        Effect.timeout("5 seconds"),
        Effect.provide(layer(identity, remote.layer)),
      )
    }).pipe(Effect.runPromise)

  const results: Array<{ readonly order: string; readonly state: A }> = []
  for (const order of everyOrder(options.concurrent)) {
    results.push({
      order: describe(order),
      state: await replay(options.layer, [order]),
    })
    if (options.uncompacted === undefined) continue
    results.push({
      order: `uncompacted ${describe(order)}`,
      state: await replay(options.uncompacted, [order]),
    })
    results.push({
      order: `one at a time ${describe(order)}`,
      state: await replay(
        options.layer,
        order.map((entry) => [entry]),
      ),
    })
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
