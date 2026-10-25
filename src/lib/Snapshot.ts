import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import { QueryBuilder, type RowOf, type TableName } from "@/IndexedDb"
import { TableChanges } from "./TableChanges"

// Every read is answered from a per-table snapshot: the whole table, loaded
// on the first read and kept live by reloading whenever the table's
// reactivity key is invalidated. One-shot reads and streams share the same
// array, so a repo never issues a fresh `getAll` per lookup.
//
// An `incremental` snapshot reloads only the records `TableChanges` reports,
// and keeps every other row object as it was, so what a repo derives from a
// row can be cached on it. Only a table that `tableRowHandler` alone writes
// may be incremental, and only where keys reach the other tabs
// (`TableChanges.broadcasts`). It still reads the whole table when no keys were
// reported (a bare invalidation), after a failed reload, and when more than
// a quarter of the table changed.

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
>(table: Name, options?: { readonly incremental?: boolean }) {
  type Row = RowOf<Name>
  const db = yield* QueryBuilder
  const reactivity = yield* Reactivity.Reactivity
  const scope = yield* Effect.scope
  const changes = yield* TableChanges
  const takeChanges =
    options?.incremental && changes.broadcasts
      ? yield* changes.subscribe(table)
      : undefined

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
    const load = takeChanges
      ? loadIncremental(db, table, takeChanges)
      : (db.from(table).select() as unknown as Effect.Effect<
          ReadonlyArray<Row>,
          IndexedDbQueryBuilder.IndexedDbQueryError
        >)
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

// Past this share of the table, one `getAll` is cheaper than reading each
// changed record.
const incrementalLimit = 0.25

const loadIncremental = <Name extends TableName>(
  db: QueryBuilder["Service"],
  table: Name,
  takeChanges: () => ReadonlyArray<IDBValidKey>,
) => {
  type Row = RowOf<Name>
  // The query builder's types don't follow a generic table name.
  const from = db.from(table) as any
  const keyPath: string = from.table.keyPath
  // The rows of the last load, in key order as `getAll` returns them, and
  // their keys. Unset until a full load succeeds, and after a failed load.
  let rows: Array<Row> | undefined
  let keys: Array<IDBValidKey> = []

  const loadAll = Effect.suspend(
    () =>
      from.select() as Effect.Effect<
        Array<Row>,
        IndexedDbQueryBuilder.IndexedDbQueryError
      >,
  ).pipe(
    Effect.map((all) => {
      rows = all
      keys = all.map((row) => (row as any)[keyPath])
      return all
    }),
  )

  const loadChanged = (changed: ReadonlyArray<IDBValidKey>) =>
    Effect.forEach(changed, (key) =>
      (
        from.select().equals(key).limit(1) as Effect.Effect<
          ReadonlyArray<Row>,
          IndexedDbQueryBuilder.IndexedDbQueryError
        >
      ).pipe(Effect.map((found) => [key, found[0]] as const)),
    ).pipe(
      db.withTransaction({ tables: [table], mode: "readonly" }),
      Effect.map((records) => {
        const nextRows = rows!.slice()
        const nextKeys = keys.slice()
        for (const [key, row] of records) {
          const index = keyIndex(nextKeys, key)
          const found =
            index < nextKeys.length && compareKeys(nextKeys[index], key) === 0
          if (row !== undefined && found) {
            nextRows[index] = row
          } else if (row !== undefined) {
            nextRows.splice(index, 0, row)
            nextKeys.splice(index, 0, key)
          } else if (found) {
            nextRows.splice(index, 1)
            nextKeys.splice(index, 1)
          }
        }
        rows = nextRows
        keys = nextKeys
        return nextRows
      }),
    )

  return Effect.suspend(() => {
    const changed = uniqueKeys(takeChanges())
    if (
      rows === undefined ||
      changed.length === 0 ||
      changed.length > rows.length * incrementalLimit
    ) {
      return loadAll
    }
    return loadChanged(changed)
  }).pipe(
    Effect.tapError(() =>
      Effect.sync(() => {
        rows = undefined
      }),
    ),
  )
}

// IndexedDB's key order, for the key types tables use: numbers, then dates,
// then strings by UTF-16 code unit, then binary by byte, then arrays.
const keyRank = (key: IDBValidKey): number =>
  typeof key === "number"
    ? 0
    : key instanceof Date
      ? 1
      : typeof key === "string"
        ? 2
        : Array.isArray(key)
          ? 4
          : 3

const keyBytes = (key: BufferSource): Uint8Array =>
  ArrayBuffer.isView(key)
    ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
    : new Uint8Array(key)

const compareKeys = (a: IDBValidKey, b: IDBValidKey): number => {
  const rank = keyRank(a) - keyRank(b)
  if (rank !== 0) return rank
  if (typeof a === "number" || a instanceof Date) {
    return Number(a) - Number(b as number | Date)
  }
  if (typeof a === "string") {
    return a < (b as string) ? -1 : a > (b as string) ? 1 : 0
  }
  if (Array.isArray(a)) {
    const other = b as ReadonlyArray<IDBValidKey>
    for (let i = 0; i < Math.min(a.length, other.length); i++) {
      const order = compareKeys(a[i], other[i])
      if (order !== 0) return order
    }
    return a.length - other.length
  }
  const x = keyBytes(a as BufferSource)
  const y = keyBytes(b as BufferSource)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return x.length - y.length
}

// The first index whose key is not below `key`.
const keyIndex = (keys: ReadonlyArray<IDBValidKey>, key: IDBValidKey) => {
  let low = 0
  let high = keys.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (compareKeys(keys[middle], key) < 0) low = middle + 1
    else high = middle
  }
  return low
}

const uniqueKeys = (
  keys: ReadonlyArray<IDBValidKey>,
): ReadonlyArray<IDBValidKey> => {
  const sorted = keys.toSorted(compareKeys)
  return sorted.filter(
    (key, i) => i === 0 || compareKeys(sorted[i - 1], key) !== 0,
  )
}
