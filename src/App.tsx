import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { RegistryProvider } from "@effect-rx/rx-react"
import { router } from "./Router"
import { makePersistedAdapter } from "@livestore/adapter-web"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker"
import { LiveStoreProvider } from "@livestore/react"
import LiveStoreWorker from "./livestore/livestore.worker?worker"
import { unstable_batchedUpdates as batchUpdates } from "react-dom"
import { schema } from "./livestore/schema"

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

export default function App() {
  useRegisterSW({
    immediate: true,
  })

  return (
    <LiveStoreProvider
      schema={schema}
      adapter={adapter}
      renderLoading={(_) => <div>Loading LiveStore ({_.stage})...</div>}
      batchUpdates={batchUpdates}
      syncPayload={{ authToken: "insecure-token-change-me" }}
    >
      <RegistryProvider>
        <RouterProvider router={router} />
      </RegistryProvider>
    </LiveStoreProvider>
  )
}
