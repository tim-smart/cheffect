import { RecipeCreate } from "@/domain/RecipeForm"
import { Store } from "@/livestore/atoms"
import { recipeByIdAtom, searchStateAtom } from "@/livestore/queries"
import { Atom, Result, useAtomValue } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { RecipeExtractionManager } from "./RecipeExtractionManager"
import { openAiClientLayer } from "@/services/AiHelpers"

export const extractRuntime = Atom.runtime((get) =>
  Layer.mergeAll(RecipeExtractionManager.Default, Store.layer).pipe(
    Layer.provide(get(openAiClientLayer)),
  ),
).pipe(Atom.keepAlive)

export const createRecipeAtom = extractRuntime.fn<string>()(
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

export const useSearchQuery = () =>
  Result.getOrElse(
    useAtomValue(
      searchStateAtom,
      Result.map((state) => state.query),
    ),
    () => "",
  )
