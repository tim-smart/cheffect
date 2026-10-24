import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import {
  durabilityBarrier,
  identityKey,
  journalDatabaseName,
  layerJournal,
  loadOrCreateIdentity,
  resolveSyncUrl,
} from "@/EventLog"
import { QueryBuilder, databaseBlockedAtom, layerDatabase } from "@/IndexedDb"
import { RecipeExtractJob } from "@/domain/RecipeExtractJob"
import {
  countRecords,
  freshIndexedDb,
  layerFreshIndexedDb,
} from "./harness/indexeddb"

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

test("first launch creates an identity, keeps it as the Store ID setting and loads it again", async () => {
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

test("sync connects only when enabled, to the server URL or else the default", () => {
  const defaultUrl = Option.some("wss://app.example.com/sync")
  const cases = [
    {
      enabled: false,
      url: Option.some("wss://sync.example.com/sync"),
      defaultUrl,
      expected: Option.none(),
    },
    { enabled: true, url: Option.none(), expected: Option.none() },
    {
      enabled: true,
      url: Option.some("https://sync.example.com/sync"),
      expected: Option.some("wss://sync.example.com/sync"),
    },
    {
      enabled: true,
      url: Option.some("http://localhost:8080"),
      defaultUrl,
      expected: Option.some("ws://localhost:8080"),
    },
    {
      enabled: true,
      url: Option.some("   "),
      defaultUrl,
      expected: defaultUrl,
    },
  ]
  for (const { expected, ...options } of cases) {
    assert.deepEqual(resolveSyncUrl(options), expected, JSON.stringify(options))
  }
})

test(
  "a blocked version-1 journal upgrade shows the close-other-tabs state and recovers when the old tab closes",
  { timeout: 10_000 },
  async () => {
    const { indexedDB } = freshIndexedDb()
    // The previous journal keeps this connection open without a versionchange
    // handler. Reproduce its schema and lifetime, not a mocked blocked error.
    const oldConnection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(journalDatabaseName, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        const entries = db.createObjectStore("entries", { keyPath: "id" })
        entries.createIndex("id", "id", { unique: true })
        entries.createIndex("event", "event")
        const remotes = db.createObjectStore("remotes", {
          keyPath: ["remoteId", "entryId"],
        })
        remotes.createIndex("id", ["remoteId", "entryId"], { unique: true })
        remotes.createIndex("sequence", ["remoteId", "sequence"], {
          unique: true,
        })
        const remoteEntryId = db.createObjectStore("remoteEntryId", {
          keyPath: ["remoteId"],
        })
        remoteEntryId.createIndex("id", "remoteId", { unique: true })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const registry = AtomRegistry.make()
    const runtime = ManagedRuntime.make(layerJournal)
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe = () => {}
    try {
      assert.equal(registry.get(databaseBlockedAtom), false)
      const blocked = new Promise<boolean>((resolve) => {
        unsubscribe = registry.subscribe(databaseBlockedAtom, (value) => {
          if (value) resolve(true)
        })
        // Bound the missing-notification failure, but still exercise recovery.
        timer = setTimeout(() => resolve(false), 1_000)
      })
      let ready = false
      const opening = runtime
        .runPromise(EventJournal.EventJournal)
        .then((journal) => {
          ready = true
          return journal
        })
      const showedBlocked = await blocked
      assert.equal(
        ready,
        false,
        "the old tab must actually hold up the upgrade",
      )
      oldConnection.close()
      const journal = await opening
      await runtime.runPromise(
        journal.write({
          event: "Test",
          primaryKey: "k",
          payload: new Uint8Array([1]),
          effect: () => Effect.void,
        }),
      )
      const entries = await runtime.runPromise(journal.entries)
      assert.equal(entries.length, 1, "the upgraded journal accepts writes")
      assert.equal(
        registry.get(databaseBlockedAtom),
        false,
        "opening clears the blocked screen",
      )
      assert.equal(
        showedBlocked,
        true,
        "a blocked journal upgrade must show the close-other-tabs screen",
      )
    } finally {
      clearTimeout(timer)
      unsubscribe()
      oldConnection.close()
      await runtime.dispose()
      registry.dispose()
    }
  },
)

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
