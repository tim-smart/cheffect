import { withToast } from "@/lib/sonner"
import { Store } from "@/livestore/atoms"
import { events, tables } from "@/livestore/schema"
import { router } from "@/Router"
import { AiHelpers } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import { queryDb } from "@livestore/livestore"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FiberMap from "effect/FiberMap"
import * as HashSet from "effect/HashSet"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { toast } from "sonner"

const extractJobs = Store.makeQuery(
  queryDb(
    tables.recipeExtractJobs
      .select("id", "url")
      .where("completedAt", "=", null),
  ),
)

export const RecipeExtractionManager = Layer.scopedDiscard(
  Effect.gen(function* () {
    const ai = yield* AiHelpers
    const store = yield* Store
    const fiberMap = yield* FiberMap.make<string>()

    const extract = Effect.fn("RecipeExtractionManager.extract")(
      function* (job: { readonly id: string; readonly url: string }) {
        const fiberId = yield* Effect.fiberId
        const extracted = yield* ai.recipeFromUrl(job.url).pipe(
          Effect.onExit((exit) => {
            if (
              Exit.isFailure(exit) &&
              !HashSet.has(Cause.interruptors(exit.cause), fiberId)
            ) {
              return Effect.void
            }
            store.commit(
              events.recipeExtractJobCompleted({
                id: job.id,
                completedAt: DateTime.unsafeNow(),
              }),
            )
            return Effect.void
          }),
        )
        const recipe = extracted.asRecipe(job.url)
        store.commit(events.recipeCreated(recipe))
        return recipe
      },
      withToast(({ url }) => ({
        loading: `Extracting recipe from ${url}...`,
        onExit(exit, toastId) {
          if (Exit.isFailure(exit)) {
            return toast.error("Failed to extract recipe", { id: toastId })
          }
          const recipe = exit.value
          toast.success("Recipe extracted successfully!", {
            id: toastId,
            cancel: undefined,
            action: {
              label: "View",
              onClick() {
                router.navigate({
                  to: `/recipes/$id`,
                  params: { id: recipe.id },
                })
              },
            },
          })
        },
      })),
    )

    yield* Atom.toStreamResult(extractJobs).pipe(
      Stream.runForEach(
        Effect.fnUntraced(function* (jobs) {
          const ids = new Set()
          for (const job of jobs!) {
            ids.add(job.id)
            yield* FiberMap.run(fiberMap, job.id, extract(job), {
              onlyIfMissing: true,
            })
          }
          for (const [id] of fiberMap) {
            if (ids.has(id)) continue
            yield* FiberMap.remove(fiberMap, id)
          }
        }),
      ),
      Effect.forkScoped,
    )
  }),
).pipe(Layer.provide(AiHelpers.Default))
