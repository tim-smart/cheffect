import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { AiHelpers } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const runtimeAtom = Atom.runtime(
  Layer.mergeAll(AiHelpers.Default, Store.layer),
)

export const createRecipeAtom = runtimeAtom.fn<string>()(
  Effect.fn(function* (url) {
    const ai = yield* AiHelpers
    const recipe = yield* ai.recipeFromUrl(url)
    const store = yield* Store
    store.commit(events.recipeCreated(recipe.asRecipe))
  }, Effect.tapErrorCause(Effect.log)),
)
