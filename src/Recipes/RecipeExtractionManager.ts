import { withToast } from "@/lib/sonner"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { router } from "@/Router"
import { AiHelpers } from "@/services/AiHelpers"
import { flow } from "effect"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { toast } from "sonner"

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
