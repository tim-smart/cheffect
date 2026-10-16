import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import {
  ExtractedRecipe,
  Recipe,
  RecipeEdit,
  RecipeIdFromString,
  SortByValue,
} from "@/domain/Recipe"
import * as HashSet from "effect/HashSet"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { eventLogAtom, writeEvent, writeEventAtom } from "@/EventLog"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import { findRecipe, findRecipeEdit, RecipeRepo, searchRecipes } from "./Repo"
import { kvsRuntime } from "@/lib/atom"

// The repos share the EventLog runtime's query builder and Reactivity, so
// handler writes reload their snapshots. Kept apart from `atoms.ts` so modules
// that atoms.ts imports (Settings) can read recipes without an import cycle.
export const recipesRuntime = Atom.runtime((get) =>
  Layer.mergeAll(RecipeRepo.layer, RecipeExtractJobRepo.layer).pipe(
    Layer.provideMerge(get(eventLogAtom.layer)),
  ),
).pipe(Atom.keepAlive)

// Every live recipe, read when called rather than cached in an atom.
export const liveRecipesAtom = recipesRuntime.fn<void>()(() =>
  RecipeRepo.use((repo) => repo.live),
)

// Writes recipes as new `RecipeCreated` entries. A recipe that already exists
// is left alone, so importing the same file twice changes nothing.
export const importRecipesAtom = recipesRuntime.fn<ReadonlyArray<Recipe>>()(
  Effect.fnUntraced(function* (recipes) {
    for (const recipe of recipes) {
      yield* writeEvent({ event: "RecipeCreated", payload: recipe })
    }
  }),
)

// Reads kept here so recipe consumers do not load the router or AI modules.

export const recipesAtom = recipesRuntime
  .atom(RecipeRepo.useSync((_) => _.stream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

export const recipeEditsAtom = recipesRuntime
  .atom(RecipeRepo.useSync((_) => _.editsStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

// Recipe details wait for both tables so pending edits never expose the original.
export const recipeSnapshotsAtom = Atom.make((get) =>
  AsyncResult.all({
    recipes: get(recipesAtom),
    edits: get(recipeEditsAtom),
  }),
)

export const recipeSearchQueryAtom = Atom.make("").pipe(Atom.keepAlive)

export const recipeSortByAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: "cheffect:recipeSortBy",
  schema: SortByValue,
  defaultValue: () => "title" as const,
})

export const allRecipesAtom = Atom.make((get) => {
  // Preload edits for navigation without tying list loading or errors to them.
  get(recipeEditsAtom)
  const query = get(recipeSearchQueryAtom)
  const sortBy = get(recipeSortByAtom)
  return AsyncResult.map(get(recipesAtom), (recipes) =>
    searchRecipes(recipes, { query, sortBy }),
  )
})

// A recipe by the id string in a route or a reference. Soft-deleted recipes
// are still found; `None` when the recipe is missing, e.g. not synced yet.
export const recipeByIdAtom = Atom.family((id: string) =>
  Atom.make((get) =>
    AsyncResult.map(get(recipesAtom), (recipes) => findRecipe(recipes, id)),
  ),
)

const recipeIdFromString = Schema.decodeSync(RecipeIdFromString)

export const showOriginalRecipeAtom = Atom.make(HashSet.empty<string>())

// The AI's suggested edit to a recipe, kept beside the recipe until it is
// saved or discarded. Writing `None` removes it.
export const modifiedRecipeByIdAtom = Atom.family((id: string) =>
  Atom.writable(
    (get) =>
      AsyncResult.map(get(recipeEditsAtom), (edits) =>
        findRecipeEdit(edits, id),
      ),
    (ctx, modified: Option.Option<ExtractedRecipe>) => {
      const recipeId = recipeIdFromString(id)
      ctx.set(
        writeEventAtom,
        Option.match(modified, {
          onNone: () => ({
            event: "RecipeEditRemove" as const,
            payload: { id: recipeId },
          }),
          onSome: (modified) => ({
            event: "RecipeEditSet" as const,
            payload: RecipeEdit.make({
              id: recipeId,
              title: modified.title,
              imageUrl: modified.imageUrl,
              prepTime: modified.prepTime,
              cookingTime: modified.cookingTime,
              servings: modified.servings,
              ingredients: modified.ingredients,
              steps: modified.steps,
              sourceName: modified.sourceName,
            }),
          }),
        }),
      )
    },
  ),
)

export const recipeForDisplayAtom = Atom.family((id: string) =>
  Atom.make((get) => {
    const showOriginal = HashSet.has(get(showOriginalRecipeAtom), id)
    return AsyncResult.map(get(recipeSnapshotsAtom), ({ recipes, edits }) => {
      const modified = findRecipeEdit(edits, id)
      return Option.map(findRecipe(recipes, id), (original) => {
        const resolved =
          showOriginal || Option.isNone(modified)
            ? original
            : new Recipe({
                ...original,
                ...modified.value,
              })
        return {
          original,
          resolved,
          isModified: Option.isSome(modified),
        } as const
      })
    })
  }),
)
