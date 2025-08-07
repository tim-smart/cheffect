import { RecipeCreate } from "@/domain/RecipeForm"
import { AiHelpers } from "@/services/AiHelpers"
import { Rx } from "@effect-rx/rx-react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export const runtimeRx = Rx.runtime(AiHelpers.Default)

export const createRecipeRx = runtimeRx.fn(
  Effect.fn(function* (url: string) {
    const ai = yield* AiHelpers
    const recipe = yield* ai.recipeFromUrl(url)
    return yield* Schema.encode(RecipeCreate)(recipe.asRecipe)
  }, Effect.tapErrorCause(Effect.log)),
)
