import { test } from "node:test"
import * as assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as HttpServer from "effect/http/HttpServer"
import * as NetAddress from "effect/net/NetAddress"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as Socket from "effect/socket/Socket"
import { storeId } from "@/EventLog"
import { Recipe } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"
import * as Server from "../../server/Server"
import { eventSamples } from "../fixtures/event-samples"
import { testIdentity } from "../harness/eventlog"
import { hasChromium, sleep, withSeededApp } from "./harness"

// Opening a share link (TIM-255, TIM-258): the app strips the fragment and
// shows the join dialog; accepting wipes the seeded data, stores the identity
// and server URL, turns sync on and pulls the joined collection from the
// combined image's sync server.

const ServerLayer = Server.layer({
  root: fileURLToPath(new URL("../fixtures/web", import.meta.url)),
  port: 0,
  databasePath: ":memory:",
})

// Another device already in the collection, writing the way the app does:
// the same tag and payload schema, over the encrypted protocol.
const SharedRecipes = EventLog.schema(
  EventGroup.empty.add({
    tag: "RecipeCreated",
    primaryKey: (recipe) => uuidString(recipe.id),
    payload: Recipe.insert,
  }),
)

const otherDevice = (url: string, identity: EventLog.Identity["Service"]) =>
  EventLogRemote.layerEncrypted.pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: true }),
    ),
    Layer.provide(RpcSerialization.layerSchemaBinary()),
    Layer.provide(Socket.layerWebSocket(url)),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provideMerge(
      EventLog.layer(
        SharedRecipes,
        EventLog.group(SharedRecipes.groups[0], (handlers) =>
          handlers.handle("RecipeCreated", () => Effect.void),
        ),
      ),
    ),
    Layer.provide(EventJournal.layerMemory),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
    Layer.provide(Layer.succeed(EventLog.CurrentStoreId, storeId)),
  )

const sharedRecipe = eventSamples.find(
  (sample) => sample.event === "RecipeCreated",
)!.payload as typeof Recipe.insert.Type

const recipeLinks = `[...document.querySelectorAll('a[href^="/recipes/"]')].map((a) => a.getAttribute("href"))`

test(
  "opening a share link strips it from the URL, and accepting it wipes the device and joins the collection",
  { skip: !hasChromium && "chromium not found", timeout: 240_000 },
  () =>
    Effect.gen(function* () {
      const { address } = yield* HttpServer.HttpServer
      assert.ok(NetAddress.isInetAddress(address))
      const serverUrl = `ws://127.0.0.1:${address.port}/sync`
      const identity = yield* testIdentity
      const key = EventLog.encodeIdentityString(identity)

      // The device stays connected until the test ends, so its upload isn't
      // cut short.
      const device = yield* Layer.build(otherDevice(serverUrl, identity))
      yield* Context.get(device, EventLog.EventLog).write({
        schema: SharedRecipes,
        event: "RecipeCreated",
        payload: sharedRecipe,
      })
      const sharedLink = `/recipes/${uuidString(sharedRecipe.id)}`

      yield* Effect.promise(() =>
        withSeededApp(async ({ browser, base }) => {
          const seeded = await browser.evaluate<Array<string>>(recipeLinks)
          assert.ok(seeded.length > 0, "the dev seed wrote recipes")
          assert.ok(!seeded.includes(sharedLink))

          // A share link is opened as a new page load, not a fragment change.
          await browser.navigate("about:blank")
          await browser.navigate(
            `${base}/#join=${key}&server=${encodeURIComponent(serverUrl)}`,
          )
          const dialog = `document.querySelector('[role="alertdialog"], [role="dialog"]')`
          await browser.waitFor(`!!${dialog}`)

          const href = await browser.evaluate<string>(`location.href`)
          assert.equal(href, `${base}/`, "the share link stays in the URL")

          // Sync is off and the device has data, so it offers an export
          // before anything is replaced.
          const buttons = `[...${dialog}.querySelectorAll("button")]`
          assert.ok(
            await browser.evaluate<boolean>(
              `${buttons}.some((b) => b.textContent.trim() === "Export all data")`,
            ),
            "the join dialog offers Export all data",
          )
          await browser.click(
            `${buttons}.find((b) => /^Join\\b/.test(b.textContent.trim()))`,
          )

          // Accepting stores the identity, the server and Enable Sync as the
          // settings atoms encode them, then reloads.
          const stored = (name: string, value: unknown) =>
            `localStorage.getItem(${JSON.stringify(name)}) === ${JSON.stringify(JSON.stringify(value))}`
          await browser.waitFor(
            [
              stored("cheffect:identity", key),
              stored("cheffect:syncServerUrl", serverUrl),
              stored("cheffect:syncEnabled", true),
            ].join(" && "),
            30_000,
          )

          // The joined collection arrives from the server, and nothing from
          // the old one is left, or re-seeded.
          await browser.navigate(`${base}/`)
          await browser.waitFor(
            `!!document.querySelector('a[href="${sharedLink}"]')`,
            30_000,
          )
          await sleep(3000)
          assert.deepEqual(await browser.evaluate(recipeLinks), [sharedLink])
        }),
      )
    }).pipe(Effect.scoped, Effect.provide(ServerLayer), Effect.runPromise),
)
