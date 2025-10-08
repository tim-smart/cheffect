import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { router } from "@/Router"
import { AiHelpers } from "@/services/AiHelpers"
import { flow } from "effect"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { toast } from "sonner"

const withToast =
  <A, E>(options: {
    readonly loading: string
    readonly onExit: (exit: Exit.Exit<A, E>, toastId: number | string) => void
  }) =>
  <R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.withFiberRuntime((fiber) => {
      const deferred = Deferred.unsafeMake<never>(fiber.id())
      const toastId = toast.loading(options.loading, {
        cancel: {
          label: "Cancel",
          onClick() {
            Deferred.unsafeDone(deferred, Exit.interrupt(fiber.id()))
          },
        },
      })
      return effect.pipe(
        Effect.onExit((exit) => {
          if (Exit.isInterrupted(exit)) {
            return Effect.void
          }
          options.onExit(exit, toastId)
          return Effect.void
        }),
        Effect.raceFirst(Deferred.await(deferred)),
      )
    })

export class RecipeExtractionManager extends Effect.Service<RecipeExtractionManager>()(
  "effect-meals/Recipes/RecipeExtractionManager",
  {
    dependencies: [AiHelpers.Default, Store.layer],
    scoped: Effect.gen(function* () {
      const ai = yield* AiHelpers
      const scope = yield* Effect.scope
      const store = yield* Store

      const extract = Effect.fn("RecipeExtractionManager.extract")(
        function* (url: string) {
          const extracted = yield* ai.recipeFromUrl(url)
          const recipe = extracted.asRecipe
          store.commit(events.recipeCreated(recipe))
          return recipe
        },
        (effect, url) =>
          effect.pipe(
            withToast({
              loading: `Extracting recipe from ${url}...`,
              onExit(exit, toastId) {
                if (Exit.isSuccess(exit)) {
                  const recipe = exit.value
                  toast.success("Recipe extracted successfully!", {
                    id: toastId,
                    cancel: undefined,
                    action: {
                      label: "View",
                      onClick() {
                        router.navigate({
                          to: `/recipe/$id`,
                          params: { id: recipe.id },
                        })
                      },
                    },
                  })
                  return
                }

                toast.error("Failed to extract recipe", { id: toastId })
              },
            }),
          ),
      )
      const extractFork = flow(extract, Effect.forkIn(scope))

      return { extract, extractFork } as const
    }),
  },
) {}
