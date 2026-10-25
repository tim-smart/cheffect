import { createServer } from "node:http"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLogServerEncrypted from "effect/eventlog/EventLogServerEncrypted"
import * as SqlEventLogServerEncrypted from "effect/eventlog/SqlEventLogServerEncrypted"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as HttpStaticServer from "effect/http/HttpStaticServer"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as RpcServer from "effect/rpc/RpcServer"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import { fetchResponse } from "./fetchGuard"

// The combined image's server: the front end build and the encrypted EventLog
// server on one origin. Live fan-out is an in-process PubSub, so it must run
// as a single instance.

// Sync
//
// The server only stores ciphertext. The client's server URL setting points
// at `/sync` verbatim.

const SyncLayer = (databasePath: string) =>
  EventLogServerEncrypted.layer.pipe(
    Layer.provide(RpcServer.layerProtocolWebsocket({ path: "/sync" })),
    Layer.provide(RpcSerialization.layerSchemaBinary()),
    Layer.provide(SqlEventLogServerEncrypted.layerStorageSubtle()),
    Layer.provide(SqliteClient.layer({ filename: databasePath })),
  )

// Fetch
//
// `/fetch?url=` fetches a page for the recipe importer, so imports work for
// sites that don't allow cross-origin requests. See `fetchGuard.ts` for what
// it refuses to fetch.

const FetchLayer = HttpRouter.add("GET", "/fetch", (request) =>
  Effect.promise(() =>
    fetchResponse(
      new URL(request.url, "http://localhost").searchParams.get("url"),
    ),
  ).pipe(
    Effect.map(({ status, headers, body }) =>
      HttpServerResponse.text(body, {
        status,
        headers,
        contentType: headers["content-type"],
      }),
    ),
  ),
)

// Front end
//
// Vite fingerprints everything under `/assets/`, so it can be cached forever.
// The HTML (including SPA fallbacks for deep links), the service worker and
// the manifest are revalidated, so a new release is picked up on next load.

const immutable = "public, max-age=31536000, immutable"
const revalidated = new Set(["/sw.js", "/manifest.webmanifest"])

const cacheControl = (
  request: HttpServerRequest.HttpServerRequest,
  response: HttpServerResponse.HttpServerResponse,
): string | undefined => {
  if (response.status >= 400) return undefined
  const { pathname } = new URL(request.url, "http://localhost")
  if (pathname.startsWith("/assets/")) return immutable
  if (revalidated.has(pathname)) return "no-cache"
  const contentType = response.headers["content-type"] ?? ""
  return contentType.startsWith("text/html") ? "no-cache" : undefined
}

const CacheControlLayer = HttpRouter.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const response = yield* httpApp
      const value = cacheControl(request, response)
      return value === undefined
        ? response
        : HttpServerResponse.setHeader(response, "cache-control", value)
    }),
  { global: true },
)

const FrontendLayer = (root: string) =>
  Layer.mergeAll(HttpStaticServer.layer({ root, spa: true }), CacheControlLayer)

// Server

export const layer = (options: {
  // The front end build (`dist/`).
  readonly root: string
  readonly port: number
  // A SQLite file, or `:memory:`.
  readonly databasePath: string
}) =>
  HttpRouter.serve(
    Layer.mergeAll(
      FrontendLayer(options.root),
      SyncLayer(options.databasePath),
      FetchLayer,
    ),
    { disableLogger: true },
  ).pipe(
    Layer.provideMerge(
      NodeHttpServer.layer(createServer, {
        port: options.port,
        gracefulShutdownTimeout: "1 second",
      }),
    ),
  )
