import { schema } from "./schema"
import { makePersistedAdapter } from "@livestore/adapter-web"
import { unstable_batchedUpdates } from "react-dom"
import LiveStoreWorker from "./livestore.worker?worker"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?worker"
import { AtomLivestore } from "@effect-atom/atom-livestore"
import { useAtomSet } from "@effect-atom/atom-react"

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  // TODO: use SharedWorker when supported on android
  sharedWorker: LiveStoreSharedWorker as any,
})

export class Store extends AtomLivestore.Tag<Store>()("Store", {
  schema,
  storeId: "default",
  adapter,
  batchUpdates: unstable_batchedUpdates,
}) {}

export const useCommit = () => useAtomSet(Store.commit)
