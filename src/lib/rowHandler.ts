import * as Effect from "effect/Effect"
import * as EventRow from "effect/eventlog/EventRow"
import type * as Schema from "effect/Schema"
import type { QueryBuilder, RowOf, TableName } from "@/IndexedDb"
import { TableChanges } from "./TableChanges"

// The `EventRow.handler` for a row kept as one record of one table. `set`
// replaces the record, `patch` writes its fields only when it exists, and
// `remove` deletes it, which is the callback contract convergence relies on.
//
// `tableKey` turns the row key, the typed values of its key fields, into the
// record's key. `toRecord` builds the record from a row when they differ,
// e.g. to store the primary key.
//
// Every record it writes is reported to `TableChanges`, so a snapshot of the
// table can read back just those records.
export const tableRowHandler = <
  Name extends TableName,
  Tag extends string,
  Fields extends Schema.Struct.Fields,
  Key extends keyof Fields & string,
  Error extends Schema.Top,
  KeySchema extends Schema.Constraint,
>(
  db: QueryBuilder["Service"],
  table: Name,
  row: EventRow.EventRow<Tag, Fields, Key, Error, KeySchema>,
  options: {
    readonly tableKey: (key: Schema.Schema.Type<KeySchema>) => IDBValidKey
    readonly toRecord?: (row: Schema.Struct<Fields>["Type"]) => RowOf<Name>
  },
) => {
  // The query builder's types don't follow a generic table name.
  const records = db.from(table) as any
  const toRecord = options.toRecord ?? ((row) => row)
  const changed = (key: Schema.Schema.Type<KeySchema>) =>
    TableChanges.use((changes) => changes.changed(table, options.tableKey(key)))
  return EventRow.handler(row, {
    set: (row, key) =>
      (records.upsert(toRecord(row)) as Effect.Effect<unknown, unknown>).pipe(
        Effect.orDie,
        Effect.andThen(changed(key)),
      ),
    patch: (key, fields) =>
      Effect.gen(function* () {
        const [record] = yield* records
          .select()
          .equals(options.tableKey(key))
          .limit(1) as Effect.Effect<ReadonlyArray<object>, unknown>
        if (record === undefined) return
        yield* records.upsert({ ...record, ...fields }) as Effect.Effect<
          unknown,
          unknown
        >
        yield* changed(key)
      }).pipe(Effect.orDie),
    remove: (key) =>
      (
        records.delete().equals(options.tableKey(key)) as Effect.Effect<
          unknown,
          unknown
        >
      ).pipe(Effect.orDie, Effect.andThen(changed(key))),
  })
}
