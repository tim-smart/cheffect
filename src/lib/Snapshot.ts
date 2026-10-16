import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import { QueryBuilder, type RowOf, type TableName } from "@/IndexedDb"

// Every read is answered from a per-table snapshot: the whole table, loaded
// on the first read and kept live by reloading whenever the table's
// reactivity key is invalidated. One-shot reads and streams share the same
// array, so a repo never issues a fresh `getAll` per lookup.

export interface Snapshot<A> {
  readonly current: Effect.Effect<
    ReadonlyArray<A>,
    IndexedDbQueryBuilder.IndexedDbQueryError
  >
  readonly stream: Stream.Stream<
    ReadonlyArray<A>,
    IndexedDbQueryBuilder.IndexedDbQueryError
  >
}

export const makeSnapshot = Effect.fnUntraced(function* <
  Name extends TableName,
>(table: Name) {
  type Row = RowOf<Name>
  const db = yield* QueryBuilder
  const reactivity = yield* Reactivity.Reactivity
  const scope = yield* Effect.scope

  const loaded = yield* Deferred.make<
    void,
    IndexedDbQueryBuilder.IndexedDbQueryError
  >()
  const updates = yield* PubSub.unbounded<ReadonlyArray<Row>>()
  let latest: ReadonlyArray<Row> = []
  let started = false

  const start = Effect.suspend(() => {
    if (started) return Effect.void
    started = true
    const load = db.from(table).select() as unknown as Effect.Effect<
      Array<Row>,
      IndexedDbQueryBuilder.IndexedDbQueryError
    >
    return reactivity.stream([table], load).pipe(
      Stream.runForEach((rows) => {
        latest = rows
        return Deferred.succeed(loaded, undefined).pipe(
          Effect.andThen(PubSub.publish(updates, rows)),
        )
      }),
      Effect.tapCause(Effect.logError),
      Effect.catchCause((cause) => Deferred.failCause(loaded, cause)),
      Effect.forkIn(scope),
      Effect.asVoid,
    )
  })

  const current = start.pipe(
    Effect.andThen(Deferred.await(loaded)),
    Effect.map(() => latest),
  )

  const stream = Stream.unwrap(
    Effect.gen(function* () {
      yield* start
      const subscription = yield* PubSub.subscribe(updates)
      yield* Deferred.await(loaded)
      return Stream.concat(
        Stream.succeed(latest),
        Stream.fromSubscription(subscription),
      )
    }),
  )

  return { current, stream } satisfies Snapshot<Row>
})
