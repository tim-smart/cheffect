import * as path from "node:path"
import { createServer, type ViteDevServer } from "vite"

// One dev server for every e2e process, so modules are transformed once.
// Test processes inherit the URL through the environment.

let server: ViteDevServer | undefined

export const globalSetup = async () => {
  server = await createServer({
    configFile: path.resolve("vite.config.ts"),
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  })
  await server.listen()
  process.env.CHEFFECT_E2E_BASE = server.resolvedUrls!.local[0].replace(
    /\/$/,
    "",
  )
}

export const globalTeardown = async () => {
  await server?.close()
}
