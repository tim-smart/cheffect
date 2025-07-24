import { RouterProvider } from "@tanstack/react-router"
import { useRegisterSW } from "virtual:pwa-register/react"
import { RegistryProvider, Rx } from "@effect-rx/rx-react"
import { router } from "./Router"
import { makePersistedAdapter } from "@livestore/adapter-web"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker"
import { LiveStoreProvider, useStore } from "@livestore/react"
import LiveStoreWorker from "./livestore/livestore.worker?worker"
import { unstable_batchedUpdates as batchUpdates } from "react-dom"
import { schema } from "./livestore/schema"
import React from "react"
import { liveStoreRx } from "./livestore/rx"

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
      <StoreRegistration>
        <RouterProvider router={router} />
      </StoreRegistration>
    </LiveStoreProvider>
  )
}

function StoreRegistration({ children }: { children?: React.ReactNode }) {
  const store = useStore().store
  return (
    <RegistryProvider
      initialValues={[Rx.initialValue(liveStoreRx, store as any)]}
    >
      {children}
    </RegistryProvider>
  )
}
