import { schema } from "./schema"
import { makeSingleTabAdapter } from "@livestore/adapter-web"
import { unstable_batchedUpdates } from "react-dom"
import LiveStoreWorker from "./livestore.worker?worker"
import { AtomLivestore } from "@effect-atom/atom-livestore"
import { useAtomSet } from "@effect-atom/atom-react"

const adapter = makeSingleTabAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
})

export class Store extends AtomLivestore.Tag<Store>()("Store", {
  schema,
  storeId: "default",
  adapter,
  batchUpdates: unstable_batchedUpdates,
}) {}

export const useCommit = () => useAtomSet(Store.commit)
