import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { router } from "@/Router"
import { AiHelpers } from "@/services/AiHelpers"
import { flow } from "effect"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { toast } from "sonner"

const withToast =
  <A, E, Args extends ReadonlyArray<any>>(
    options: (...args: Args) => {
      readonly loading: string
      readonly onExit: (exit: Exit.Exit<A, E>, toastId: number | string) => void
    },
  ) =>
  <R>(
    effect: Effect.Effect<A, E, R>,
    ...args: Args
  ): Effect.Effect<A, E, R> => {
    const opts = options(...args)
    return Effect.flatMap(Effect.fork(effect), (fiber) => {
      const toastId = toast.loading(opts.loading, {
        cancel: {
          label: "Cancel",
          onClick() {
            fiber.unsafeInterruptAsFork(fiber.id())
          },
        },
      })
      fiber.addObserver((exit) => {
        if (Exit.isInterrupted(exit)) return
        opts.onExit(exit, toastId)
      })
      return Fiber.join(fiber)
    })
  }

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
        withToast((url) => ({
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
                    to: `/recipe/$id`,
                    params: { id: recipe.id },
                  })
                },
              },
            })
          },
        })),
      )
      const extractFork = flow(extract, Effect.forkIn(scope))

      return { extract, extractFork } as const
    }),
  },
) {}
