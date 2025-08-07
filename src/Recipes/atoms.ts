import { storeAtomUnsafe } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { AiHelpers } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"

export const runtimeAtom = Atom.runtime(AiHelpers.Default)

export const createRecipeAtom = runtimeAtom.fn<string>()(
  Effect.fn(function* (url, get) {
    const ai = yield* AiHelpers
    const recipe = yield* ai.recipeFromUrl(url)
    const store = get(storeAtomUnsafe)
    store!.commit(events.recipeCreated(recipe.asRecipe))
  }, Effect.tapErrorCause(Effect.log)),
)
