import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as EventLog from "effect/eventlog/EventLog"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import { identityKey, syncEnabledKey, syncServerUrlKey } from "@/EventLog"
import { isSyncKey } from "./ShareLink"

export { makeShareLink, parseJoinInput } from "./ShareLink"
export type { JoinRequest } from "./ShareLink"

export class InvalidSyncKey extends Schema.TaggedError<InvalidSyncKey>()(
  "InvalidSyncKey",
  {},
) {}

// Keys that belong to the collection rather than the device. The recipe sort
// order is a device preference and survives a join.
const collectionKeys = [
  "setting:mealPlanWeekStart",
  "cheffect:groceryCurrentList",
]

// Joining replaces this device's data with another collection (TIM-255). The
// order is what makes a crash safe:
//
// 1. Wipe the cheffect database, then the journal. Rebuilding first makes
//    other tabs reload, which releases their hold on the journal.
// 2. Clear the collection's keys.
// 3. Write the identity, the server URL and Enable Sync.
//
// A crash before step 3 leaves an empty device on the old identity, which
// pulls its old collection back. Writing the identity first could upload old
// data into someone else's collection. The caller reloads afterwards.
export const join = Effect.fnUntraced(function* (target: {
  readonly identity: string
  // Left as it is when a bare key was pasted.
  readonly serverUrl?: string | undefined
}) {
  if (!isSyncKey(target.identity)) {
    return yield* new InvalidSyncKey()
  }
  const db = yield* IndexedDbDatabase.IndexedDbDatabase
  const log = yield* EventLog.EventLog
  const kvs = yield* KeyValueStore.KeyValueStore
  const strings = KeyValueStore.toSchemaStore(kvs, Schema.String)

  yield* db.rebuild
  yield* log.destroy

  for (const key of collectionKeys) {
    yield* kvs.remove(key)
  }

  yield* strings.set(identityKey, target.identity)
  if (target.serverUrl !== undefined) {
    yield* strings.set(syncServerUrlKey, target.serverUrl)
  }
  yield* KeyValueStore.toSchemaStore(kvs, Schema.Boolean).set(
    syncEnabledKey,
    true,
  )
})
