import { makeWorker } from "@livestore/adapter-web/worker"
import { makeWsSync } from "@livestore/sync-cf/client"
import { schema } from "./schema.js"

makeWorker({
  schema,
  sync: {
    backend: makeWsSync({
      url:
        import.meta.env.VITE_SYNC_SERVER_URL ||
        "wss://cheffect-sync.timsmart.workers.dev",
    }),
  },
})
