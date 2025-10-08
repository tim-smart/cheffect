import { RecipeCreate } from "@/domain/RecipeForm"
import { Store } from "@/livestore/atoms"
import { recipeByIdAtom } from "@/livestore/queries"
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { RecipeExtractionManager } from "./RecipeExtractionManager"

export const runtimeAtom = Atom.runtime(
  Layer.mergeAll(RecipeExtractionManager.Default, Store.layer),
).pipe(Atom.keepAlive)

export const createRecipeAtom = runtimeAtom.fn<string>()(
  Effect.fn(function* (url) {
    const manager = yield* RecipeExtractionManager
    yield* manager.extractFork(url)
  }),
)

export const recipeFormByIdAtom = Atom.family((id: string) =>
  Atom.make(
    Effect.fnUntraced(function* (get) {
      const recipe = yield* get.result(recipeByIdAtom(id))
      return [yield* Schema.encode(RecipeCreate)(recipe), recipe] as const
    }),
  ),
)
