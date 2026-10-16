import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/reactivity/Reactivity"
import { RecipeExtractJob, RecipeExtractJobId } from "@/domain/RecipeExtractJob"
import { QueryBuilder } from "@/IndexedDb"
import { generateUuidBytes } from "@/lib/Id"
import { makeSnapshot } from "@/lib/Snapshot"

// Extract jobs are local to the device and bypass the EventLog: writes go
// straight through the query builder and invalidate the table key by hand.
export class RecipeExtractJobRepo extends Context.Service<RecipeExtractJobRepo>()(
  "cheffect/RecipeExtractJobs/Repo/RecipeExtractJobRepo",
  {
    make: Effect.gen(function* () {
      const db = yield* QueryBuilder
      const reactivity = yield* Reactivity.Reactivity
      const snapshot = yield* makeSnapshot("recipeExtractJobs")
      const jobs = db.from("recipeExtractJobs")
      const invalidate = reactivity.invalidate(["recipeExtractJobs"])

      // A fresh single-row read, never the snapshot: callers decide from it
      // while holding the job's lock.
      const byIdFresh = (id: RecipeExtractJobId) =>
        jobs
          .select()
          .equals(id)
          .limit(1)
          .pipe(Effect.map((rows) => Option.fromUndefinedOr(rows[0])))

      return {
        pending: snapshot.stream.pipe(
          Stream.map((rows) => rows.filter((job) => job.completedAt === null)),
        ),
        add: Effect.fnUntraced(function* (url: string) {
          const job = RecipeExtractJob.insert.make({
            id: RecipeExtractJobId.make(generateUuidBytes()),
            url,
            completedAt: null,
          })
          yield* jobs.insert(job)
          yield* invalidate
          return job
        }),
        byIdFresh,
        complete: Effect.fnUntraced(function* (id: RecipeExtractJobId) {
          const job = yield* byIdFresh(id)
          if (Option.isNone(job)) return
          yield* jobs.upsert({
            ...job.value,
            completedAt: yield* DateTime.now,
          })
          yield* invalidate
        }),
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
