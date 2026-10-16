import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { RecipeExtractJob, RecipeExtractJobId } from "@/domain/RecipeExtractJob"
import { makeSnapshot } from "@/lib/Snapshot"
import { uuidBytes } from "@/lib/Id"
import { layerFreshIndexedDb, rawRequest } from "./harness/indexeddb"

// One `cheffect` database with a single V1. The local-only extract jobs table
// is its first table; module stages add theirs to the same version.

const layer = QueryBuilder.layer.pipe(
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provide(layerFreshIndexedDb),
)

const jobId = RecipeExtractJobId.make(
  uuidBytes("0193c7a0-1b2c-7def-8123-456789abcdef"),
)
const job = RecipeExtractJob.insert.make({
  id: jobId,
  url: "https://example.com/soup",
  completedAt: null,
})

test("V1 opens the cheffect database with the recipeExtractJobs table and round-trips a job", async () => {
  const result = await Effect.gen(function* () {
    const db = yield* QueryBuilder
    const [name, stores] = yield* db.use((database) => [
      database.name,
      Array.from(database.objectStoreNames),
    ])
    const jobs = db.from("recipeExtractJobs")
    yield* jobs.insert(job)
    const pending = yield* jobs.select().equals(jobId).first()
    yield* jobs.upsert({
      ...pending,
      completedAt: DateTime.makeUnsafe(1_700_000_000_000),
    })
    const done = yield* jobs.select().equals(jobId).first()
    return {
      name,
      hasJobs: stores.includes("recipeExtractJobs"),
      pending: { url: pending.url, completedAt: pending.completedAt },
      completedAt: done.completedAt && DateTime.toEpochMillis(done.completedAt),
    }
  }).pipe(Effect.provide(layer), Effect.runPromise)

  assert.deepEqual(result, {
    name: "cheffect",
    hasJobs: true,
    pending: { url: "https://example.com/soup", completedAt: null },
    completedAt: 1_700_000_000_000,
  })
})

test("a table snapshot serves reads from one cached array and reloads when its key is invalidated", async () => {
  const result = await Effect.gen(function* () {
    const db = yield* QueryBuilder
    const reactivity = yield* Reactivity.Reactivity
    const snapshot = yield* makeSnapshot("recipeExtractJobs")

    const emitted = yield* Queue.unbounded<ReadonlyArray<RecipeExtractJob>>()
    yield* Effect.forkScoped(
      Stream.runForEach(snapshot.stream, (rows) => Queue.offer(emitted, rows)),
    )
    const before = yield* snapshot.current

    yield* db.from("recipeExtractJobs").insert(job)
    yield* reactivity.invalidate(["recipeExtractJobs"])

    let latest = yield* Queue.take(emitted)
    while (latest.length === 0) {
      latest = yield* Queue.take(emitted)
    }
    const after = yield* snapshot.current
    return {
      before: before.map((row) => row.url),
      streamed: latest.map((row) => row.url),
      after: after.map((row) => row.url),
    }
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.scoped,
    Effect.provide(layer),
    Effect.runPromise,
  )

  assert.deepEqual(result, {
    before: [],
    streamed: ["https://example.com/soup"],
    after: ["https://example.com/soup"],
  })
})

test("a failed reload surfaces the error, and the next invalidation recovers", async () => {
  const badId = new Uint8Array(16).fill(7)
  const result = await Effect.gen(function* () {
    const db = yield* QueryBuilder
    const reactivity = yield* Reactivity.Reactivity
    const snapshot = yield* makeSnapshot("recipeExtractJobs")

    const first = yield* snapshot.current
    const consumer = yield* Effect.forkScoped(Stream.runDrain(snapshot.stream))

    // a row the table schema can't decode, written behind the query builder's back
    yield* rawRequest(db.database.current, "recipeExtractJobs", (store) =>
      store.put({ id: badId, url: 123, completedAt: "soon" }),
    )
    yield* reactivity.invalidate(["recipeExtractJobs"])
    const streamExit = yield* Fiber.join(consumer).pipe(
      Effect.exit,
      Effect.timeoutOption("1 second"),
    )
    const whileBroken = yield* Effect.exit(snapshot.current)

    yield* rawRequest(db.database.current, "recipeExtractJobs", (store) =>
      store.delete(badId),
    )
    yield* db.from("recipeExtractJobs").insert(job)
    yield* reactivity.invalidate(["recipeExtractJobs"])
    const recovered = yield* snapshot.current.pipe(
      Effect.retry({
        while: () => true,
        schedule: Schedule.spaced("10 millis"),
      }),
      Effect.timeout("1 second"),
    )

    return {
      first: first.length,
      streamFailed:
        Option.isSome(streamExit) && Exit.isFailure(streamExit.value),
      readFailedWhileBroken: Exit.isFailure(whileBroken),
      recovered: recovered.map((row) => row.url),
    }
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.scoped,
    Effect.provide(layer),
    Effect.runPromise,
  )

  assert.deepEqual(result, {
    first: 0,
    streamFailed: true,
    readFailedWhileBroken: true,
    recovered: ["https://example.com/soup"],
  })
})
