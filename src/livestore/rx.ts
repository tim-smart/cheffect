import { schema } from "./schema"
import { makePersistedAdapter } from "@livestore/adapter-web"
import { unstable_batchedUpdates } from "react-dom"
import LiveStoreWorker from "./livestore.worker?worker"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker"
import { RxLivestore } from "@effect-rx/rx-livestore"
import { useRxSet } from "@effect-rx/rx-react"

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

export const {
  runtimeRx,
  commitRx,
  storeRx,
  storeRxUnsafe,
  makeQueryRxUnsafe,
  makeQueryRx,
} = RxLivestore.make({
  schema,
  storeId: "default",
  adapter,
  batchUpdates: unstable_batchedUpdates,
})

export const useCommit = () => useRxSet(commitRx)
