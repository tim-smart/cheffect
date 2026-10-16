import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
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

test("first launch creates an identity, keeps it under the Store ID key and never uses it as the storeId", async () => {
  const result = await Effect.gen(function* () {
    const kvs = yield* KeyValueStore.KeyValueStore
    const beforeFirstLaunch = yield* kvs.get(identityKey)
    const first = yield* loadOrCreateIdentity
    const stored = yield* kvs.get(identityKey)
    const second = yield* loadOrCreateIdentity
    return { beforeFirstLaunch, first, stored, second }
  }).pipe(
    Effect.provide([KeyValueStore.layerMemory, EventLogEncryption.layerSubtle]),
    Effect.runPromise,
  )

  assert.equal(result.beforeFirstLaunch, undefined)
  assert.ok(result.stored, "the identity is stored on first launch")
  assert.equal(
    EventLog.decodeIdentityString(result.stored).publicKey,
    result.first.publicKey,
  )
  assert.equal(result.second.publicKey, result.first.publicKey)
  assert.equal(storeId, "default")
  assert.notEqual(storeId, result.stored)
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
