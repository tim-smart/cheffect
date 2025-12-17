import { RecipeCreate } from "@/domain/RecipeForm"
import { Store } from "@/livestore/atoms"
import {
  allRecipesAtom,
  recipeByIdAtom,
  searchStateAtom,
} from "@/livestore/queries"
import { Atom, Result, useAtomValue } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { RecipeExtractionManager } from "./RecipeExtractionManager"
import { openAiClientLayer } from "@/services/AiHelpers"
import { events } from "@/livestore/schema"
import * as HashSet from "effect/HashSet"
import { Recipe } from "@/domain/Recipe"

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

export const exportAtom = Store.runtime.fn<void>()(
  Effect.fnUntraced(function* (_, get) {
    const recipes = yield* get.result(allRecipesAtom)
    const json = yield* Schema.encode(Recipe.arrayJson)(recipes)
    const file = new File(
      [JSON.stringify(json)],
      `cheffect-${new Date().toISOString()}.txt`,
      { type: "text/plain" },
    )
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] })
    }
  }),
)

export const importAtom = Store.runtime.fn<File>()(
  Effect.fnUntraced(function* (file) {
    const text = yield* Effect.promise(() => file.text())
    const json = JSON.parse(text)
    const decoded = yield* Schema.decode(Recipe.arrayJson)(json)
    const store = yield* Store
    for (const r of decoded) {
      const recipe = new Recipe({
        ...r,
        ingredientsConverted: null,
        ingredientScale: 1,
      })
      store.commit(events.recipeCreated(recipe))
    }
  }),
)
