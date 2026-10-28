import { writeEvent } from "@/EventLog"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import type { RecipeExtractJob } from "@/domain/RecipeExtractJob"
import { uuidString } from "@/lib/Id"
import { RecipeEvent } from "./Events"
import { withToast } from "@/lib/sonner"
import { tryWebLock } from "@/lib/WebLock"
import { router } from "@/Router"
import { AiHelpers } from "@/services/AiHelpers"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FiberMap from "effect/FiberMap"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as EventJournal from "effect/eventlog/EventJournal"
import { toast } from "sonner"

// The host without "www.", for naming a site in a toast.
const siteName = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const failureReason = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return error instanceof Error ? error.message : String(error)
}

// Runs in every tab. Each job runs under its own Web Lock, and inside the lock
// the job is re-read from IndexedDB, so a job that another tab finished, failed
// or is working on is skipped.
export const RecipeExtractionManager = Layer.effectDiscard(
  Effect.gen(function* () {
    const ai = yield* AiHelpers
    const jobs = yield* RecipeExtractJobRepo
    const fiberMap = yield* FiberMap.make<string>()
    const context = yield* Effect.context<EventJournal.EventJournal>()
    const retry = (url: string) => Effect.runForkWith(context)(jobs.add(url))

    const extract = Effect.fn("RecipeExtractionManager.extract")(
      function* (job: RecipeExtractJob) {
        const extracted = yield* ai.recipeFromUrl(job.url)
        const recipe = extracted.asRecipe(job.url)
        // Completing the job drops it from the pending stream, which
        // interrupts this fiber, so the recipe is written first and neither
        // write can be cut short.
        yield* writeEvent(RecipeEvent.set(recipe)).pipe(
          Effect.andThen(jobs.complete(job.id)),
          Effect.uninterruptible,
        )
        return recipe
      },
      withToast(({ url }) => ({
        loading: `Extracting recipe from ${url}...`,
        onExit(exit, toastId) {
          if (Exit.isFailure(exit)) {
            return toast.error(
              `Failed to extract recipe from ${siteName(url)}`,
              {
                id: toastId,
                description: failureReason(exit.cause),
                cancel: undefined,
                action: {
                  label: "Retry",
                  onClick() {
                    retry(url)
                  },
                },
              },
            )
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
                  params: { id: recipe.idString },
                })
              },
            },
          })
        },
      })),
    )

    const run = (id: string, job: RecipeExtractJob) =>
      tryWebLock(
        `cheffect/extract/${id}`,
        Effect.gen(function* () {
          const fresh = yield* jobs.byIdFresh(job.id)
          if (
            Option.isNone(fresh) ||
            fresh.value.completedAt !== null ||
            fresh.value.failedAt !== null
          ) {
            return
          }
          // A failed job is recorded so it is not run again on every load. An
          // interrupt is not a failure: closing the tab, or another tab
          // finishing the job, interrupts the fiber.
          yield* extract(fresh.value).pipe(
            Effect.onError((cause) =>
              Cause.hasInterrupts(cause)
                ? Effect.void
                : Effect.ignore(jobs.fail(job.id, failureReason(cause))),
            ),
          )
        }),
      )

    yield* jobs.pending.pipe(
      Stream.runForEach(
        Effect.fnUntraced(function* (pending) {
          const ids = new Set<string>()
          for (const job of pending) {
            const id = uuidString(job.id)
            ids.add(id)
            yield* FiberMap.run(fiberMap, id, run(id, job), {
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
)
