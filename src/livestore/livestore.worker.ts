import { makeWorker } from "@livestore/adapter-web/worker"
import { makeSyncBackend } from "@livestore/sync-electric"
import { schema } from "./schema.js"

const backend = makeSyncBackend({
  endpoint: "/api/electric",
  ping: { enabled: true },
})

makeWorker({
  schema,
  sync: {
    backend,
  },
})
