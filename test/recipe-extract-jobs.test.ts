import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import { layerFreshIndexedDb, rawRequest } from "./harness/indexeddb"

// A URL import that fails is recorded and leaves the pending queue, so it is
// not run again on every load. Jobs stored before failures were recorded
// still load, as pending.

const layer = RecipeExtractJobRepo.layer.pipe(
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(EventJournal.layerMemory),
  Layer.provideMerge(Reactivity.layer),
  Layer.provide(layerFreshIndexedDb),
)

test("a failed job leaves the pending queue; old rows load as pending", async () => {
  const oldId = new Uint8Array(16).fill(7)
  const result = await Effect.gen(function* () {
    const db = yield* QueryBuilder
    const jobs = yield* RecipeExtractJobRepo
    // The queue reloads after each write, so wait for one with this many jobs.
    const pendingUrls = (count: number) =>
      jobs.pending.pipe(
        Stream.map((rows) => rows.map((job) => job.url).sort()),
        Stream.filter((urls) => urls.length === count),
        Stream.runHead,
        Effect.timeout("1 second"),
      )

    // a row as written before jobs had failedAt and error
    yield* rawRequest(db.database.current, "recipeExtractJobs", (store) =>
      store.put({ id: oldId, url: "https://old.test/", completedAt: null }),
    )
    const failing = yield* jobs.add("https://fails.test/")
    yield* jobs.add("https://works.test/")
    const before = yield* pendingUrls(3)

    yield* jobs.fail(failing.id, "403 Forbidden")
    const after = yield* pendingUrls(2)
    const failed = yield* jobs.byIdFresh(failing.id)
    const old = yield* jobs.byIdFresh(oldId as typeof failing.id)
    return {
      before,
      after,
      failed: Option.map(failed, (job) => [job.failedAt !== null, job.error]),
      old: Option.map(old, (job) => [job.failedAt, job.error]),
    }
  }).pipe(Effect.scoped, Effect.provide(layer), Effect.runPromise)

  assert.deepEqual(result, {
    before: Option.some([
      "https://fails.test/",
      "https://old.test/",
      "https://works.test/",
    ]),
    after: Option.some(["https://old.test/", "https://works.test/"]),
    failed: Option.some([true, "403 Forbidden"]),
    old: Option.some([null, null]),
  })
})
