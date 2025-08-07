import { RecipeCreate } from "@/domain/RecipeForm"
import { AiHelpers } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export const runtimeAtom = Atom.runtime(AiHelpers.Default)

export const createRecipeAtom = runtimeAtom.fn(
  Effect.fn(function* (url: string) {
    const ai = yield* AiHelpers
    const recipe = yield* ai.recipeFromUrl(url)
    return yield* Schema.encode(RecipeCreate)(recipe.asRecipe)
  }, Effect.tapErrorCause(Effect.log)),
)
