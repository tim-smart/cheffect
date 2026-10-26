import "fake-indexeddb/auto"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

// Every case gets its own IDBFactory, so nothing leaks between cases. The
// EventJournal's IndexedDB implementation reaches for the `indexedDB` global
// rather than the IndexedDb service, so the fresh factory is installed there
// as well. Cases in one file run one after another, which keeps that safe.
export const freshIndexedDb = (): IndexedDb.IndexedDb => {
  const indexedDB = new IDBFactory()
  ;(globalThis as any).indexedDB = indexedDB
  return IndexedDb.make({ indexedDB, IDBKeyRange })
}

export const layerFreshIndexedDb = Layer.sync(
  IndexedDb.IndexedDb,
  freshIndexedDb,
)

// Writes to a store behind the query builder's back, bypassing the table
// schema. For putting rows the schema can't decode, to make a read fail.
export const rawRequest = <A>(
  connection: IDBDatabase,
  store: string,
  f: (store: IDBObjectStore) => IDBRequest<A>,
): Effect.Effect<A, Error> =>
  Effect.callback<A, Error>((resume) => {
    const transaction = connection.transaction(store, "readwrite")
    const request = f(transaction.objectStore(store))
    transaction.onerror = () =>
      resume(Effect.fail(new Error(String(transaction.error))))
    transaction.onabort = () =>
      resume(Effect.fail(new Error(String(transaction.error))))
    transaction.oncomplete = () => resume(Effect.succeed(request.result))
  })
