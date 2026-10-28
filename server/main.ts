import { fileURLToPath } from "node:url"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Server from "./Server"

// `dist/` sits next to this file's directory both in the repo (`server/`) and
// in the image (`dist-server/`).
const root = fileURLToPath(new URL("../dist", import.meta.url))

const MainLayer = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(8080))
    const databasePath = yield* Config.String("DATABASE_PATH").pipe(
      Config.withDefault("cheffect-sync.db"),
    )
    const corsAllowedOrigins = yield* Config.String(
      "CORS_ALLOWED_ORIGINS",
    ).pipe(Config.withDefault(""))
    return Server.layer({ root, port, databasePath, corsAllowedOrigins })
  }),
)

Layer.launch(MainLayer).pipe(NodeRuntime.runMain)
