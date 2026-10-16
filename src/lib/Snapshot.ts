import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
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

  type State = Exit.Exit<
    ReadonlyArray<Row>,
    IndexedDbQueryBuilder.IndexedDbQueryError
  >
  const loaded = yield* Deferred.make<void>()
  const updates = yield* PubSub.unbounded<State>()
  let latest: State = Exit.succeed([])
  let started = false

  const start = Effect.suspend(() => {
    if (started) return Effect.void
    started = true
    const load = db.from(table).select() as unknown as Effect.Effect<
      Array<Row>,
      IndexedDbQueryBuilder.IndexedDbQueryError
    >
    // Errors are snapshot states, not worker failures. Keep the invalidation
    // subscription alive so the next reload can recover.
    return reactivity.stream([table], Effect.exit(load)).pipe(
      Stream.runForEach((state) => {
        latest = state
        return Deferred.succeed(loaded, undefined).pipe(
          Effect.andThen(PubSub.publish(updates, state)),
        )
      }),
      Effect.tapCause(Effect.logError),
      Effect.forkIn(scope),
      Effect.asVoid,
    )
  })

  const current = start.pipe(
    Effect.andThen(Deferred.await(loaded)),
    Effect.flatMap(() => latest),
  )

  const stream = Stream.unwrap(
    Effect.gen(function* () {
      yield* start
      const subscription = yield* PubSub.subscribe(updates)
      yield* Deferred.await(loaded)
      return Stream.concat(
        Stream.fromEffect(latest),
        Stream.fromSubscription(subscription).pipe(
          Stream.mapEffect((state) => state),
        ),
      )
    }),
  )

  return { current, stream } satisfies Snapshot<Row>
})
