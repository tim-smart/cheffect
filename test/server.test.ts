import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import "fake-indexeddb/auto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as HttpServer from "effect/http/HttpServer"
import * as NetAddress from "effect/net/NetAddress"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as Socket from "effect/socket/Socket"
import {
  eventLogAtom,
  identityKey,
  remoteAtom,
  storeId,
  syncEnabledAtom,
  syncServerUrlAtom,
  writeEventAtom,
} from "@/EventLog"
import { RecipeEvent } from "@/Recipes/Events"
import { recipesAtom } from "@/Recipes/runtime"
import { sampleRecipe } from "./fixtures/event-samples"
import * as Server from "../server/Server"
import { freshIndexedDb } from "./harness/indexeddb"

// The combined image's server: one process serves the front end
// build and the encrypted EventLog server on `/sync`. `server/main.ts` reads
// `PORT`, `DATABASE_PATH` and `CORS_ALLOWED_ORIGINS` and launches this same
// layer.

const root = fileURLToPath(new URL("./fixtures/web", import.meta.url))

const ServerLayer = Server.layer({
  root,
  port: 0,
  databasePath: ":memory:",
})

const serverPort = Effect.gen(function* () {
  const { address } = yield* HttpServer.HttpServer
  assert.ok(NetAddress.isInetAddress(address), "the server listens on TCP")
  return address.port
})

// The server stores ciphertext and never decodes payloads, so any group
// proves sync. The client stack matches the app's remote: encrypted protocol,
// SchemaBinary over a WebSocket, the URL used verbatim.
const Probe = EventGroup.empty.add({
  tag: "Probe",
  primaryKey: ({ id }) => id,
  payload: Schema.Struct({ id: Schema.String }),
})

const ProbeEvents = EventLog.schema(Probe)

const makeClient = (url: string, identity: EventLog.Identity["Service"]) =>
  EventLogRemote.layerEncrypted.pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: true }),
    ),
    Layer.provide(RpcSerialization.layerSchemaBinary()),
    Layer.provide(Socket.layerWebSocket(url)),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provideMerge(
      EventLog.layer(
        ProbeEvents,
        EventLog.group(Probe, (handlers) =>
          handlers.handle("Probe", () => Effect.void),
        ),
      ),
    ),
    Layer.provide(EventJournal.layerMemory),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
    Layer.provide(Layer.succeed(EventLog.CurrentStoreId, storeId)),
  )

const waitForEntry = (entry: EventJournal.Entry) =>
  EventLog.EventLog.use((log) => log.entries).pipe(
    Effect.repeat({
      until: (entries) =>
        entries.some((received) => received.idString === entry.idString),
      schedule: Schedule.spaced("20 millis"),
    }),
  )

test("serves the front end with an SPA fallback and cache headers by path", async () => {
  const index = await readFile(`${root}/index.html`, "utf8")

  await Effect.gen(function* () {
    const port = yield* serverPort
    const get = (path: string) =>
      Effect.promise(() =>
        fetch(`http://localhost:${port}${path}`, {
          headers: { accept: "text/html" },
        }),
      )

    for (const path of ["/", "/recipes/0f8e2a/edit"]) {
      const response = yield* get(path)
      assert.equal(response.status, 200, path)
      assert.equal(yield* Effect.promise(() => response.text()), index, path)
      assert.equal(response.headers.get("cache-control"), "no-cache", path)
    }

    const asset = yield* get("/assets/index-fixture.js")
    assert.equal(asset.status, 200)
    assert.equal(
      asset.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    )

    for (const path of ["/sw.js", "/manifest.webmanifest"]) {
      const response = yield* get(path)
      assert.equal(response.status, 200, path)
      assert.equal(
        yield* Effect.promise(() => response.text()),
        yield* Effect.promise(() => readFile(`${root}${path}`, "utf8")),
        path,
      )
      assert.equal(response.headers.get("cache-control"), "no-cache", path)
    }

    const missing = yield* get("/assets/missing.js")
    assert.equal(missing.status, 404)
    assert.equal(missing.headers.get("cache-control"), null)

    // `/fetch` is a route of its own, not an SPA fallback, and refuses to
    // fetch this server's own address.
    const fetched = yield* get(
      `/fetch?url=${encodeURIComponent(`http://127.0.0.1:${port}/`)}`,
    )
    assert.equal(fetched.status, 403)

    const video = yield* get("/youtube?id=invalid")
    assert.equal(video.status, 400)
    assert.match(video.headers.get("content-type")!, /application\/json/)
    assert.equal(
      (yield* Effect.promise(() => video.json()))._tag,
      "Unavailable",
    )
  }).pipe(Effect.provide(ServerLayer), Effect.runPromise)
})

// An app on another origin may read `/fetch` and `/youtube` only when its
// origin is in `CORS_ALLOWED_ORIGINS`.
test("import routes allow only the origins in CORS_ALLOWED_ORIGINS", async () => {
  await Effect.gen(function* () {
    const port = yield* serverPort
    const fromOrigin = (path: string, origin: string) =>
      Effect.promise(() =>
        fetch(`http://localhost:${port}${path}`, { headers: { origin } }),
      )
    for (const path of ["/fetch?url=", "/youtube?id=invalid"]) {
      const allowed = yield* fromOrigin(path, "https://app.example.test")
      assert.equal(
        allowed.headers.get("access-control-allow-origin"),
        "https://app.example.test",
        path,
      )
      assert.equal(allowed.headers.get("vary"), "origin", path)
      const other = yield* fromOrigin(path, "https://other.example.test")
      assert.equal(other.headers.get("access-control-allow-origin"), null, path)
    }
  }).pipe(
    Effect.provide(
      Server.layer({
        root,
        port: 0,
        databasePath: ":memory:",
        corsAllowedOrigins: "https://app.example.test, https://b.example.test",
      }),
    ),
    Effect.runPromise,
  )
})

// The app's own sync atoms against two servers. Changing the server URL
// rebuilds `remoteAtom` against the new server, which gets this device's whole
// journal: nothing is wiped, reloaded or re-keyed.

// The browser globals the app's layers read: `window.indexedDB`, from
// fake-indexeddb, and `localStorage`. Test files share a process, so each
// device starts from a fresh factory and an empty localStorage.
;(globalThis as any).window ??= globalThis
const freshBrowserStorage = () => {
  freshIndexedDb()
  const storage = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    },
  }
}

const appEntries = eventLogAtom.atom(
  EventLog.EventLog.use((log) => log.entries),
)

test("changing the server URL uploads this device's journal to the new server and keeps its data", async () => {
  freshBrowserStorage()
  await Effect.gen(function* () {
    const first = yield* Layer.build(ServerLayer).pipe(
      Effect.flatMap((context) => serverPort.pipe(Effect.provide(context))),
    )
    const second = yield* Layer.build(ServerLayer).pipe(
      Effect.flatMap((context) => serverPort.pipe(Effect.provide(context))),
    )
    const urlOf = (port: number) => `ws://localhost:${port}/sync`

    const registry = AtomRegistry.make()
    yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()))
    registry.set(syncServerUrlAtom, Option.some(urlOf(first)))
    registry.set(syncEnabledAtom, true)
    registry.mount(remoteAtom)

    registry.set(writeEventAtom, RecipeEvent.set(sampleRecipe))
    yield* AtomRegistry.getResult(registry, writeEventAtom, {
      suspendOnWaiting: true,
    })
    const [written] = yield* AtomRegistry.getResult(registry, appEntries)
    const identityString = localStorage.getItem(identityKey)!
    const identity = EventLog.decodeIdentityString(JSON.parse(identityString))

    const onFirst = yield* Layer.build(makeClient(urlOf(first), identity))
    yield* waitForEntry(written).pipe(Effect.provide(onFirst))

    registry.set(syncServerUrlAtom, Option.some(urlOf(second)))
    const onSecond = yield* Layer.build(makeClient(urlOf(second), identity))
    yield* waitForEntry(written).pipe(Effect.provide(onSecond))

    assert.equal(localStorage.getItem(identityKey), identityString)
    const recipes = yield* AtomRegistry.getResult(registry, recipesAtom)
    assert.deepEqual(
      recipes.all.map((recipe) => recipe.title),
      [sampleRecipe.title],
    )
  }).pipe(Effect.timeout("10 seconds"), Effect.scoped, Effect.runPromise)
})
