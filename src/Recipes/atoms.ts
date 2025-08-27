import { RecipeCreate } from "@/domain/RecipeForm"
import { Store } from "@/livestore/atoms"
import { recipeByIdAtom } from "@/livestore/queries"
import { AiHelpers } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const runtimeAtom = Atom.runtime(
  Layer.mergeAll(AiHelpers.Default, Store.layer),
)

export const createRecipeAtom = runtimeAtom.fn<string>()(
  Effect.fn(function* (url) {
    const ai = yield* AiHelpers
    const extracted = yield* ai.recipeFromUrl(url)
    return yield* Schema.encode(RecipeCreate)(extracted.asRecipe)
  }, Effect.tapErrorCause(Effect.log)),
)

export const recipeFormByIdAtom = Atom.family((id: string) =>
  Atom.make(
    Effect.fnUntraced(function* (get) {
      const recipe = yield* get.result(recipeByIdAtom(id))
      return [yield* Schema.encode(RecipeCreate)(recipe), recipe] as const
    }),
  ),
)
