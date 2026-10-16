import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import {
  durabilityBarrier,
  identityKey,
  journalDatabaseName,
  loadOrCreateIdentity,
  resolveSyncUrl,
  storeId,
} from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { RecipeExtractJob } from "@/domain/RecipeExtractJob"
import { countRecords, layerFreshIndexedDb } from "./harness/indexeddb"

// The identity is a kvs setting like the server URL and Enable Sync: it is
// read and written through the schema store that `Atom.kvs` uses, so the
// value under the key is the JSON encoding of the identity string.
const identitySetting = KeyValueStore.KeyValueStore.use((kvs) =>
  Effect.succeed(KeyValueStore.toSchemaStore(kvs, Schema.String)),
)

const identityLayers = [
  KeyValueStore.layerMemory,
  EventLogEncryption.layerSubtle,
] as const

test("first launch creates an identity, keeps it as the Store ID setting and never uses it as the storeId", async () => {
  const result = await Effect.gen(function* () {
    const setting = yield* identitySetting
    const beforeFirstLaunch = yield* setting.get(identityKey)
    const first = yield* loadOrCreateIdentity
    const stored = yield* setting.get(identityKey)
    const second = yield* loadOrCreateIdentity
    return { beforeFirstLaunch, first, stored, second }
  }).pipe(Effect.provide(identityLayers), Effect.runPromise)

  assert.deepEqual(result.beforeFirstLaunch, Option.none())
  assert.ok(
    Option.isSome(result.stored),
    "the identity is stored on first launch",
  )
  assert.equal(
    EventLog.decodeIdentityString(result.stored.value).publicKey,
    result.first.publicKey,
  )
  assert.equal(result.second.publicKey, result.first.publicKey)
  assert.equal(storeId, "default")
  assert.notEqual(storeId, result.stored.value)
})

// localStorage as two tabs see it: a moment passes between reading the key
// and acting on it, so two first launches can both find it absent before
// either has written.
const layerSlowKvs = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.gen(function* () {
    const memory = yield* KeyValueStore.KeyValueStore
    return KeyValueStore.makeStringOnly({
      get: (key) =>
        memory.get(key).pipe(Effect.tap(() => Effect.sleep("1 millis"))),
      set: memory.set,
      remove: memory.remove,
    })
  }),
).pipe(Layer.provide(KeyValueStore.layerMemory))

test("two first launches at the same time agree on one identity", async () => {
  const [a, b] = await Effect.all(
    [loadOrCreateIdentity, loadOrCreateIdentity],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.provide([layerSlowKvs, EventLogEncryption.layerSubtle]),
    Effect.runPromise,
  )

  assert.equal(a.publicKey, b.publicKey)
})

test("sync connects only when it is enabled and a server URL is set", () => {
  const cases = [
    {
      enabled: false,
      url: Option.some("wss://sync.example.com/sync"),
      expected: Option.none(),
    },
    { enabled: true, url: Option.none(), expected: Option.none() },
    { enabled: true, url: Option.some("   "), expected: Option.none() },
    {
      enabled: true,
      url: Option.some("wss://sync.example.com/sync"),
      expected: Option.some("wss://sync.example.com/sync"),
    },
    {
      enabled: true,
      url: Option.some("https://sync.example.com/sync"),
      expected: Option.some("wss://sync.example.com/sync"),
    },
    {
      enabled: true,
      url: Option.some("http://localhost:8080"),
      expected: Option.some("ws://localhost:8080"),
    },
  ]
  for (const { enabled, url, expected } of cases) {
    assert.deepEqual(
      resolveSyncUrl({ enabled, url }),
      expected,
      JSON.stringify({ enabled, url }),
    )
  }
})

test("the durability barrier spans the cheffect tables and the journal's entries store", async () => {
  const layer = QueryBuilder.layer.pipe(
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(
      EventJournal.layerIndexedDb({ database: journalDatabaseName }),
    ),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
  const counts = await Effect.gen(function* () {
    const db = yield* QueryBuilder
    const journal = yield* EventJournal.EventJournal
    const { indexedDB } = yield* IndexedDb.IndexedDb

    yield* db.from("recipeExtractJobs").insert(
      RecipeExtractJob.insert.make({
        url: "https://example.com/soup",
        completedAt: null,
      }),
    )
    yield* journal.write({
      event: "Test",
      primaryKey: "k",
      payload: new Uint8Array([1]),
      effect: () => Effect.void,
    })
    yield* durabilityBarrier

    // what the next page load would see through its own connections
    return {
      jobs: yield* countRecords(indexedDB, "cheffect", "recipeExtractJobs"),
      entries: yield* countRecords(indexedDB, journalDatabaseName, "entries"),
    }
  }).pipe(Effect.provide(layer), Effect.runPromise)

  assert.deepEqual(counts, { jobs: 1, entries: 1 })
})
