import { RecipeCreate } from "@/domain/RecipeForm"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { RecipeExtractionManager } from "./RecipeExtractionManager"
import {
  AiHelpers,
  isAiEnabledAtom,
  aiHelpersLayer,
  openAiClientLayer,
} from "@/services/AiHelpers"
import * as HashSet from "effect/HashSet"
import { Recipe, RecipeId, RecipeIdFromString } from "@/domain/Recipe"
import * as DateTime from "effect/DateTime"
import { router } from "@/Router"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { aiCountry } from "@/Settings"
import { withToast } from "@/lib/sonner"
import * as Exit from "effect/Exit"
import { toast } from "sonner"
import { writeEvent } from "@/EventLog"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import { generateUuidBytes } from "@/lib/Id"
import { RecipeEditEvent, RecipeEvent, recipeUpdate } from "./Events"
import { RecipeRepo, searchRecipes } from "./Repo"
import { recipesFromPaprika } from "./paprika"
import {
  importRecipesAtom,
  modifiedRecipeByIdAtom,
  recipeByIdAtom,
  recipesAtom,
  recipesRuntime,
  showOriginalRecipeAtom,
} from "./runtime"

export {
  allRecipesAtom,
  recipeSearchQueryAtom,
  recipeSortByAtom,
  modifiedRecipeByIdAtom,
  recipeByIdAtom,
  recipeForDisplayAtom,
  recipesAtom,
  recipesRuntime,
  showOriginalRecipeAtom,
} from "./runtime"

export const extractRuntime = Atom.runtime((get) =>
  RecipeExtractionManager.pipe(
    Layer.provideMerge(get(aiHelpersLayer)),
    Layer.provideMerge(get(openAiClientLayer)),
    Layer.provideMerge(get(recipesRuntime.layer)),
  ),
).pipe(Atom.keepAlive)

// Reads

export const mealPlanRecipesQueryAtom = Atom.make("")

export const mealPlanRecipesAtom = Atom.make((get) => {
  const query = get(mealPlanRecipesQueryAtom)
  return AsyncResult.map(get(recipesAtom), (recipes) =>
    searchRecipes(recipes, { query, sortBy: "title" }),
  )
})

export const recipeTitleAtom = Atom.family((id: string) =>
  Atom.make((get) =>
    AsyncResult.map(
      get(recipeByIdAtom(id)),
      Option.map((r) => r.title),
    ),
  ),
)

export const recipeFormByIdAtom = Atom.family((id: string) =>
  Atom.make((get) =>
    AsyncResult.map(
      get(recipeByIdAtom(id)),
      Option.map(
        (recipe) => [Schema.encodeSync(RecipeCreate)(recipe), recipe] as const,
      ),
    ),
  ),
)

// Writes

const recipeIdFromString = Schema.decodeSync(RecipeIdFromString)

const recipeEditRemove = (id: RecipeId) =>
  writeEvent(RecipeEditEvent.remove({ id: id }))

export const createRecipeAtom = extractRuntime
  .fn<string>()(
    Effect.fn(function* (url) {
      const jobs = yield* RecipeExtractJobRepo
      yield* jobs.add(url)
    }),
    { concurrent: true },
  )
  .pipe(Atom.setIdleTTL("20 seconds"))

export const recipeFromImagesAtom = extractRuntime.fn<FileList>()(
  Effect.fnUntraced(
    function* (files) {
      const helpers = yield* AiHelpers
      const extracted = yield* helpers.recipesFromImages(files)
      const recipes = Array.map(extracted, (r) => r.asRecipe())
      for (const recipe of recipes) {
        yield* writeEvent(RecipeEvent.set(recipe))
      }
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
            action: Array.isReadonlyArrayNonEmpty(exit.value)
              ? {
                  label: "View",
                  onClick() {
                    const recipeId = exit.value[0]!.idString
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

export const discardModifiedRecipeAtom = recipesRuntime.fn<string>()(
  Effect.fnUntraced(function* (id, get) {
    yield* recipeEditRemove(recipeIdFromString(id))
    get.registry.update(showOriginalRecipeAtom, HashSet.remove(id))
  }),
)

export const saveModifiedRecipeAtom = recipesRuntime.fn<string>()(
  Effect.fnUntraced(function* (id, get) {
    const repo = yield* RecipeRepo
    const recipe = yield* repo.byId(id)
    const modified = yield* repo.editById(id)
    if (Option.isNone(recipe) || Option.isNone(modified)) return
    yield* writeEvent(
      recipeUpdate(
        new Recipe({
          ...recipe.value,
          ...modified.value,
          updatedAt: yield* DateTime.now,
        }),
      ),
    )
    yield* recipeEditRemove(recipe.value.id)
    get.registry.update(showOriginalRecipeAtom, HashSet.remove(id))
  }),
)

export const newModifiedRecipeAtom = recipesRuntime.fn<string>()(
  Effect.fnUntraced(function* (id, get) {
    const repo = yield* RecipeRepo
    const recipe = yield* repo.byId(id)
    const modified = yield* repo.editById(id)
    if (Option.isNone(recipe) || Option.isNone(modified)) return
    const now = yield* DateTime.now
    const newRecipe = new Recipe({
      ...recipe.value,
      ...modified.value,
      id: RecipeId.make(generateUuidBytes()),
      createdAt: now,
      updatedAt: now,
    })
    yield* writeEvent(RecipeEvent.set(newRecipe))
    yield* recipeEditRemove(recipe.value.id)
    get.registry.update(showOriginalRecipeAtom, HashSet.remove(id))
    router.navigate({ to: "/recipes/$id", params: { id: newRecipe.idString } })
  }),
)

export const checkedIngredientsAtom = Atom.family((_recipeId: string) =>
  Atom.make(HashSet.empty<string>()).pipe(Atom.keepAlive),
)

export const importPaprikaAtom = recipesRuntime.fn<File>()(
  Effect.fnUntraced(
    function* (file, get) {
      const buffer = yield* Effect.promise(() => file.arrayBuffer())
      const { recipes, photosLeftOut } = yield* recipesFromPaprika(
        new Uint8Array(buffer),
      )
      const added = yield* get.setResult(importRecipesAtom, recipes)
      return {
        added: added.length,
        withoutPhoto: added.filter((r) => photosLeftOut.has(r.idString)).length,
      }
    },
    withToast((_) => ({
      loading: "Importing recipes from Paprika",
      onExit(exit, toastId) {
        if (Exit.isFailure(exit)) {
          return toast.error("Failed to import from Paprika", { id: toastId })
        }
        const { added, withoutPhoto } = exit.value
        toast.success(
          added === 0
            ? "No new recipes to import"
            : `Imported ${added} ${added === 1 ? "recipe" : "recipes"}`,
          {
            id: toastId,
            cancel: undefined,
            description:
              withoutPhoto === 0
                ? undefined
                : `${withoutPhoto} ${withoutPhoto === 1 ? "has" : "have"} no photo. Photos saved in Paprika aren't imported yet.`,
          },
        )
      },
    })),
  ),
)

export const recipeSelectedStep = Atom.family((_id: string) =>
  Atom.make(0).pipe(Atom.keepAlive),
)

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
                  params: { id: recipe.idString },
                })
              },
            },
          })
        },
      })),
    )
    get.set(modifiedRecipeByIdAtom(recipe.idString), Option.some(converted))
  }),
)

export const canConvertIngredientsAtom = Atom.make((get) => {
  const aiEnabled = get(isAiEnabledAtom)
  if (!aiEnabled) return false
  const ocountry = get(aiCountry.atom).pipe(AsyncResult.value, Option.flatten)
  if (Option.isNone(ocountry)) return false
  return true
})
