import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Semaphore from "effect/Semaphore"
import {
  ExtractedRecipe,
  Recipe,
  type RecipeChanges,
  RecipeIdFromString,
  SortByValue,
} from "@/domain/Recipe"
import * as HashSet from "effect/HashSet"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { eventLogAtom, writeEvent, writeEventAtom } from "@/EventLog"
import { RecipeEditEvent, RecipeEvent } from "./Events"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import {
  findRecipe,
  findRecipeEdit,
  recipeAsShown,
  RecipeRepo,
  searchRecipes,
} from "./Repo"
import { kvsRuntime } from "@/lib/atom"

// The repos share the EventLog runtime's query builder and Reactivity, so
// handler writes reload their snapshots. Kept apart from `atoms.ts` so modules
// that atoms.ts imports (Settings) can read recipes without an import cycle.
export const recipesRuntime = Atom.runtime((get) =>
  Layer.mergeAll(RecipeRepo.layer, RecipeExtractJobRepo.layer).pipe(
    Layer.provideMerge(get(eventLogAtom.layer)),
  ),
).pipe(Atom.keepAlive)

// Writes recipes as new `set` entries. A `set` replaces the whole recipe, so
// one that already exists here is skipped, and importing the same file twice
// changes nothing.
export const importRecipesAtom = recipesRuntime.fn<ReadonlyArray<Recipe>>()(
  Effect.fnUntraced(function* (recipes) {
    const existing = yield* RecipeRepo.use((repo) => repo.current)
    const added: Array<Recipe> = []
    for (const recipe of recipes) {
      if (existing.byId.has(recipe.idString)) continue
      yield* writeEvent(RecipeEvent.set(recipe))
      added.push(recipe)
    }
    return added
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
          onNone: () => RecipeEditEvent.remove({ id: recipeId }),
          onSome: (modified) =>
            RecipeEditEvent.set({
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
      )
    },
  ),
)

export const recipeForDisplayAtom = Atom.family((id: string) =>
  Atom.make((get) => {
    const showOriginal = HashSet.has(get(showOriginalRecipeAtom), id)
    return AsyncResult.map(get(recipeSnapshotsAtom), ({ recipes, edits }) =>
      Option.map(findRecipe(recipes, id), (original) => ({
        original,
        resolved: recipeAsShown(original, edits, showOriginal),
        isModified: Option.isSome(findRecipeEdit(edits, id)),
      })),
    )
  }),
)

// Recipe reads and edits for the assistant. Reads return what the user sees on
// each recipe page, so the assistant works from the same version as the user.
export const assistantRecipes = Effect.gen(function* () {
  const registry = yield* AtomRegistry.AtomRegistry
  const repo = yield* RecipeRepo
  // A model response can suggest several edits at once. Each one reads the
  // pending edit after the previous one is written, so none is lost.
  const editLock = Semaphore.makeUnsafe(1)
  const asShown = Effect.map(repo.edits, (edits) => {
    const originals = registry.get(showOriginalRecipeAtom)
    return (recipe: Recipe) =>
      recipeAsShown(recipe, edits, HashSet.has(originals, recipe.idString))
  })
  return {
    search: (query: string) =>
      Effect.zipWith(
        repo.search({ query, sortBy: "title" }),
        asShown,
        (found, shown) => found.map(shown),
      ),
    byId: (id: string) =>
      Effect.zipWith(repo.byId(id), asShown, (found, shown) =>
        Option.map(found, shown),
      ),
    // Merges the changes into the pending edit, or starts one from the saved
    // recipe. "Show original" only previews, so a hidden pending edit is kept,
    // and the user is switched back to the edits to see the suggestion.
    // `false` when the recipe is missing.
    suggestEdit: (id: string, changes: RecipeChanges) =>
      Effect.gen(function* () {
        const recipe = yield* repo.byId(id)
        if (Option.isNone(recipe)) return false
        const pending = yield* repo.editById(id)
        const base = Option.getOrElse(pending, () => recipe.value)
        const { clear = [], ...set } = changes
        const edit = {
          id: recipe.value.id,
          title: base.title,
          imageUrl: base.imageUrl,
          prepTime: base.prepTime,
          cookingTime: base.cookingTime,
          servings: base.servings,
          ingredients: base.ingredients,
          steps: base.steps,
          sourceName: base.sourceName,
          ...set,
        }
        for (const field of clear) edit[field] = null
        yield* writeEvent(RecipeEditEvent.set(edit))
        registry.update(
          showOriginalRecipeAtom,
          HashSet.remove(recipe.value.idString),
        )
        return true
      }).pipe(editLock.withPermits(1)),
  } as const
})
