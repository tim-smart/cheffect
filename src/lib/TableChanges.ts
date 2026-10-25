import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type { TableName } from "@/IndexedDb"

// The keys of the records each table's writers touched, for snapshots that
// reload only those records instead of the whole table.
//
// `tableRowHandler` reports a key once its write has been issued, inside the
// handler transaction and before the invalidation that reloads the snapshot.
// A key only says "read this record again": the snapshot reads it back in a
// readonly transaction, which IndexedDB starts after the writing transaction
// has committed or rolled back, so it sees what was stored either way.
//
// A subscriber gets every key reported for its table since it last took
// them. Only snapshots of tables that `tableRowHandler` alone writes
// subscribe; any other writer would leave their records stale.

export class TableChanges extends Context.Service<
  TableChanges,
  {
    readonly changed: (
      table: TableName,
      key: IDBValidKey,
    ) => Effect.Effect<void>
    readonly subscribe: (
      table: TableName,
    ) => Effect.Effect<() => ReadonlyArray<IDBValidKey>, never, Scope.Scope>
  }
>()("cheffect/lib/TableChanges") {
  static readonly layer = Layer.sync(this, () => {
    const subscribers = new Map<TableName, Set<{ keys: Array<IDBValidKey> }>>()
    return TableChanges.of({
      changed: (table, key) =>
        Effect.sync(() => {
          for (const subscriber of subscribers.get(table) ?? []) {
            subscriber.keys.push(key)
          }
        }),
      subscribe: (table) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const subscriber = { keys: new Array<IDBValidKey>() }
            let forTable = subscribers.get(table)
            if (forTable === undefined) {
              forTable = new Set()
              subscribers.set(table, forTable)
            }
            forTable.add(subscriber)
            return { forTable, subscriber }
          }),
          ({ forTable, subscriber }) =>
            Effect.sync(() => forTable.delete(subscriber)),
        ).pipe(
          Effect.map(({ subscriber }) => () => {
            const taken = subscriber.keys
            subscriber.keys = []
            return taken
          }),
        ),
    })
  })
}
