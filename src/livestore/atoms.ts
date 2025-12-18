import { schema } from "./schema"
import { makePersistedAdapter } from "@livestore/adapter-web"
import { unstable_batchedUpdates } from "react-dom"
import LiveStoreWorker from "./livestore.worker?worker"
import LiveStoreWorkerNoSync from "./livestore-no-sync.worker?worker"
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

const syncEnabledAtomKvs = Atom.kvs({
  runtime: kvsRuntime,
  key: "livestore:syncEnabled",
  schema: Schema.Boolean,
  defaultValue: () => false,
})
export const syncEnabledAtom = Atom.writable(
  syncEnabledAtomKvs.read,
  (ctx, value: boolean) => {
    ctx.set(syncEnabledAtomKvs, value)
    window.location.reload()
  },
)

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

const adapterNoSync = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorkerNoSync,
  sharedWorker: LiveStoreSharedWorker,
})

export class Store extends AtomLivestore.Tag<Store>()("Store", (get) => ({
  schema,
  storeId: get(storeIdAtom),
  adapter: get(syncEnabledAtom) ? adapter : adapterNoSync,
  batchUpdates: unstable_batchedUpdates,
})) {}

export const useCommit = () => useAtomSet(Store.commit)
