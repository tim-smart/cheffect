import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
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
// Every tab shares the database, so keys are also broadcast to the other
// tabs, which take them as their own and invalidate the table. Without that a
// tab would never re-read a record another tab wrote: its own write reloads
// only the records it reports, and a remote batch that carries the other
// tab's entry as a duplicate runs no handler for it. IndexedDB orders the
// re-read after the writing transaction whichever connection it is on, so it
// doesn't matter whether the message or the duplicate arrives first. Where
// there is no `BroadcastChannel`, another tab's writes would go unseen, so
// snapshots reload the whole table as before. Tabs on a build that doesn't
// broadcast never write beside this one: see `V4` in `IndexedDb.ts`.
//
// A subscriber gets every key reported for its table since it last took
// them. Only snapshots of tables that `tableRowHandler` alone writes
// subscribe; any other writer would leave their records stale.

interface Message {
  readonly table: TableName
  readonly key: IDBValidKey
}

const channelName = "cheffect/TableChanges"

export class TableChanges extends Context.Service<
  TableChanges,
  {
    // Whether keys reach the other tabs. Without it no snapshot may reload
    // incrementally.
    readonly broadcasts: boolean
    readonly changed: (
      table: TableName,
      key: IDBValidKey,
    ) => Effect.Effect<void>
    readonly subscribe: (
      table: TableName,
    ) => Effect.Effect<() => ReadonlyArray<IDBValidKey>, never, Scope.Scope>
  }
>()("cheffect/lib/TableChanges") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const reactivity = yield* Reactivity.Reactivity
      const subscribers = new Map<
        TableName,
        Set<{ keys: Array<IDBValidKey> }>
      >()
      const push = (table: TableName, key: IDBValidKey) => {
        const forTable = subscribers.get(table)
        if (forTable === undefined || forTable.size === 0) return false
        for (const subscriber of forTable) subscriber.keys.push(key)
        return true
      }

      const channel =
        typeof BroadcastChannel === "undefined"
          ? undefined
          : new BroadcastChannel(channelName)
      if (channel !== undefined) {
        channel.onmessage = (event: MessageEvent<Message>) => {
          const { table, key } = event.data
          if (push(table, key)) reactivity.invalidateUnsafe([table])
        }
        yield* Effect.addFinalizer(() => Effect.sync(() => channel.close()))
      }

      return TableChanges.of({
        broadcasts: channel !== undefined,
        changed: (table, key) =>
          Effect.sync(() => {
            push(table, key)
            channel?.postMessage({ table, key } satisfies Message)
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
    }),
  )
}
