import { makeWorker } from "@livestore/adapter-web/worker"
import { makeWsSync } from "@livestore/sync-cf/client"
import { schema } from "./schema.js"

makeWorker({
  schema,
  sync: {
    backend: makeWsSync({
      url: "wss://cheffect-sync.timsmart.workers.dev",
    }),
  },
})
