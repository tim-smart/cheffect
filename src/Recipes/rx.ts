import { storeRxUnsafe } from "@/livestore/rx"
import { events } from "@/livestore/schema"
import { AiHelpers } from "@/services/AiHelpers"
import { Rx } from "@effect-rx/rx-react"
import * as Effect from "effect/Effect"

export const runtimeRx = Rx.runtime(AiHelpers.Default)

export const createRecipeRx = runtimeRx.fn(
  Effect.fn(function* (url: string, get: Rx.FnContext) {
    const ai = yield* AiHelpers
    const recipe = yield* ai.recipeFromUrl(url)
    const store = get(storeRxUnsafe)
    store!.commit(events.recipeCreated(recipe.asRecipe))
  }, Effect.tapErrorCause(Effect.log)),
)
