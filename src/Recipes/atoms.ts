import { RecipeCreate } from "@/domain/RecipeForm"
import { Store } from "@/livestore/atoms"
import { recipeByIdAtom, searchStateAtom } from "@/livestore/queries"
import { Atom, Result, useAtomValue } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { RecipeExtractionManager } from "./RecipeExtractionManager"
import { openAiClientLayer } from "@/services/AiHelpers"
import { events } from "@/livestore/schema"
import * as HashSet from "effect/HashSet"

export const extractRuntime = Atom.runtime((get) =>
  Layer.mergeAll(RecipeExtractionManager, Store.layer).pipe(
    Layer.provide(get(openAiClientLayer)),
  ),
).pipe(Atom.keepAlive)

export const createRecipeAtom = extractRuntime
  .fn<string>()(
    Effect.fn(function* (url) {
      console.log("Created recipe from URL:", url)
      const store = yield* Store
      store.commit(
        events.recipeExtractJobAdded({
          id: crypto.randomUUID(),
          url,
        }),
      )
    }),
    { concurrent: true },
  )
  .pipe(Atom.setIdleTTL("20 seconds"))

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

export const checkedIngredientsAtom = Atom.family((_recipeId: string) =>
  Atom.make(HashSet.empty<string>()).pipe(Atom.keepAlive),
)
