import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { RecipeExtractJob } from "@/domain/RecipeExtractJob"
import { makeSnapshot } from "@/lib/Snapshot"
import { layerFreshIndexedDb, rawRequest } from "./harness/indexeddb"

// Every repo reads through a table snapshot that reloads when its reactivity
// key is invalidated. A row that fails to decode must not leave the snapshot
// broken for the rest of the session.

const layer = QueryBuilder.layer.pipe(
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provide(layerFreshIndexedDb),
)

const job = RecipeExtractJob.insert.make({
  url: "https://example.com/soup",
  completedAt: null,
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
