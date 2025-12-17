import { schema } from "./schema"
import { makePersistedAdapter } from "@livestore/adapter-web"
import { unstable_batchedUpdates } from "react-dom"
import LiveStoreWorker from "./livestore.worker?worker"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker"
import { AtomLivestore } from "@effect-atom/atom-livestore"
import { Atom, useAtomSet } from "@effect-atom/atom-react"
import { kvsRuntime } from "@/atoms"
import * as Schema from "effect/Schema"

export const storeIdAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: "livestore:storeId",
  schema: Schema.NonEmptyString,
  defaultValue: () => crypto.randomUUID(),
})

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

export class Store extends AtomLivestore.Tag<Store>()("Store", (get) => ({
  schema,
  storeId: get(storeIdAtom),
  adapter,
  batchUpdates: unstable_batchedUpdates,
})) {}

export const useCommit = () => useAtomSet(Store.commit)
