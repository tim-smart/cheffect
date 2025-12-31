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
import {
  AiHelpers,
  isAiEnabledAtom,
  openAiClientLayer,
} from "@/services/AiHelpers"
import { events } from "@/livestore/schema"
import * as HashSet from "effect/HashSet"
import { ExtractedRecipe, Recipe, RecipeEdit } from "@/domain/Recipe"
import * as DateTime from "effect/DateTime"
import { router } from "@/Router"
import { queryDb, sql } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { aiCountry } from "@/Settings"
import { withToast } from "@/lib/sonner"
import * as Exit from "effect/Exit"
import { toast } from "sonner"

export const extractRuntime = Atom.runtime((get) =>
  RecipeExtractionManager.pipe(
    Layer.provideMerge(AiHelpers.Default),
    Layer.provideMerge(get(openAiClientLayer)),
    Layer.provideMerge(get(Store.layer)),
  ),
).pipe(Atom.keepAlive)

export const createRecipeAtom = extractRuntime
  .fn<string>()(
    Effect.fn(function* (url) {
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

export const recipeFromImagesAtom = extractRuntime.fn<FileList>()(
  Effect.fnUntraced(
    function* (files) {
      const helpers = yield* AiHelpers
      const extracted = yield* helpers.recipesFromImages(files)
      const store = yield* Store
      const recipes = Array.map(extracted, (r) => {
        const recipe = r.asRecipe()
        store.commit(events.recipeCreated(recipe))
        return recipe
      })
      return recipes
    },
    withToast((_) => ({
      loading: `Extracting recipe from images`,
      onExit(exit, toastId) {
        if (Exit.isFailure(exit)) {
          return toast.error("Failed to extract recipe", { id: toastId })
        }
        toast.success(
          `${exit.value.length > 1 ? "Recipes" : "Recipe"} extracted!`,
          {
            id: toastId,
            cancel: undefined,
            action: Array.isNonEmptyReadonlyArray(exit.value)
              ? {
                  label: "View",
                  onClick() {
                    const recipeId = exit.value[0]!.id
                    router.navigate({
                      to: `/recipes/$id`,
                      params: { id: recipeId },
                    })
                  },
                }
              : undefined,
          },
        )
      },
    })),
  ),
  { concurrent: true },
)

export const recipeFormByIdAtom = Atom.family((id: string) =>
  Atom.make(
    Effect.fnUntraced(function* (get) {
      const recipe = yield* get.result(recipeByIdAtom(id))
      return [yield* Schema.encode(RecipeCreate)(recipe), recipe] as const
    }),
  ),
)

export const showOriginalRecipeAtom = Atom.make(HashSet.empty<string>())

const recipeEditById$ = (id: string) =>
  queryDb(
    {
      query: sql`select * from recipe_edits where id = ?`,
      bindValues: [id],
      schema: Schema.Array(RecipeEdit),
    },
    {
      deps: [id],
      map: Array.head,
    },
  )

export const modifiedRecipeByIdAtom = Atom.family((id: string) =>
  Atom.writable(
    Store.makeQueryUnsafe(recipeEditById$(id)).read,
    (ctx, modified: Option.Option<ExtractedRecipe>) => {
      Option.match(modified, {
        onNone() {
          ctx.set(Store.commit, events.recipeEditRemove({ id }))
        },
        onSome(modified) {
          ctx.set(
            Store.commit,
            events.recipeEditSet({
              ...modified,
              id,
            }),
          )
        },
      })
    },
  ),
)

export const recipeForDisplayAtom = Atom.family((id: string) =>
  Atom.make((get) => {
    const showOriginal = HashSet.has(get(showOriginalRecipeAtom), id)
    return get(recipeByIdAtom(id)).pipe(
      Result.map((original) => {
        const modified = Option.getOrUndefined(get(modifiedRecipeByIdAtom(id))!)
        const resolved =
          showOriginal || !modified
            ? original
            : new Recipe({
                ...original,
                ...modified,
              })

        return { original, resolved, isModified: !!modified } as const
      }),
    )
  }),
)

export const discardModifiedRecipeAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (id, get) {
    get.set(modifiedRecipeByIdAtom(id), Option.none())
    get.registry.update(showOriginalRecipeAtom, HashSet.remove(id))
  }),
)

export const saveModifiedRecipeAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (id, get) {
    const recipe = yield* get.result(recipeByIdAtom(id))
    const modified = get(modifiedRecipeByIdAtom(id))!
    if (Option.isNone(modified)) return
    const store = get(Store.storeUnsafe)!
    const newRecipe = new Recipe({
      ...recipe,
      ...modified.value,
      updatedAt: DateTime.unsafeNow(),
    })
    store.commit(events.recipeUpdated(newRecipe))
    get.set(modifiedRecipeByIdAtom(id), Option.none())
    get.registry.update(showOriginalRecipeAtom, HashSet.remove(id))
  }),
)

export const newModifiedRecipeAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (id, get) {
    const recipe = yield* get.result(recipeByIdAtom(id))
    const modified = get(modifiedRecipeByIdAtom(id))!
    if (Option.isNone(modified)) return
    const store = get(Store.storeUnsafe)!
    const newRecipe = new Recipe({
      ...recipe,
      ...modified.value,
      id: crypto.randomUUID(),
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
    })
    store.commit(events.recipeCreated(newRecipe))
    get.set(modifiedRecipeByIdAtom(id), Option.none())
    get.registry.update(showOriginalRecipeAtom, HashSet.remove(id))
    router.navigate({ to: "/recipes/$id", params: { id: newRecipe.id } })
  }),
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
        ingredientScale: 1,
      })
      store.commit(events.recipeCreated(recipe))
    }
  }),
)

export const recipeSelectedStep = Atom.make(0).pipe(Atom.setIdleTTL(0))

export const convertIngredientsAtom = AiHelpers.runtime.fn<Recipe>()(
  Effect.fnUntraced(function* (recipe, get) {
    const ocountry = yield* get.result(aiCountry.atom)
    if (Option.isNone(ocountry)) return
    const country = ocountry.value
    const ai = yield* AiHelpers
    const converted = yield* ai.convertIngredients(recipe, country).pipe(
      withToast(() => ({
        loading: `Converting ingredients for ${recipe.title}`,
        onExit(exit, toastId) {
          if (Exit.isFailure(exit)) {
            return toast.error("Failed to convert ingredients", { id: toastId })
          }
          toast.success("Ingredients converted!", {
            id: toastId,
            cancel: undefined,
            action: {
              label: "View",
              onClick() {
                router.navigate({
                  to: `/recipes/$id`,
                  params: { id: recipe.id },
                })
              },
            },
          })
        },
      })),
    )
    get.set(modifiedRecipeByIdAtom(recipe.id), Option.some(converted))
  }),
)

export const canConvertIngredientsAtom = Atom.make((get) => {
  const aiEnabled = get(isAiEnabledAtom)
  if (!aiEnabled) return false
  const ocountry = get(aiCountry.atom).pipe(Result.value, Option.flatten)
  if (Option.isNone(ocountry)) return false
  return true
})
