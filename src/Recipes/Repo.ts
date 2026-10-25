import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { Recipe, type RecipeEdit, type SortBy } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"
import { makeSnapshot } from "@/lib/Snapshot"
import { compareText, foldCase } from "@/lib/text"
import type { RecipeEditRow, RecipeRow } from "./Table"

// Reads
//
// Every read is a pure function over the table snapshots, so streams and
// one-shot Effects share one cached array per table. Lookups by id go through
// a map keyed by the canonical id string.

export interface Recipes {
  // Every recipe, soft-deleted ones included: a recipe page still renders a
  // deleted recipe, lists leave it out.
  readonly all: ReadonlyArray<Recipe>
  readonly byId: ReadonlyMap<string, Recipe>
}

export const decodeRecipes = (rows: ReadonlyArray<RecipeRow>): Recipes => {
  const all = rows.map((row) => new Recipe(row))
  return {
    all,
    byId: new Map(all.map((recipe) => [recipe.idString, recipe])),
  }
}

export type RecipeEdits = ReadonlyMap<string, typeof RecipeEdit.Type>

const decodeRecipeEdits = (rows: ReadonlyArray<RecipeEditRow>): RecipeEdits => {
  const edits = new Map<string, typeof RecipeEdit.Type>()
  for (const edit of rows) edits.set(uuidString(edit.id), edit)
  return edits
}

export const findRecipe = (
  recipes: Recipes,
  id: string,
): Option.Option<Recipe> =>
  Option.fromUndefinedOr(recipes.byId.get(id.toLowerCase()))

export const findRecipeEdit = (
  edits: RecipeEdits,
  id: string,
): Option.Option<typeof RecipeEdit.Type> =>
  Option.fromUndefinedOr(edits.get(id.toLowerCase()))

const sorters: Record<SortBy, (a: Recipe, b: Recipe) => number> = {
  createdAt: (a, b) =>
    b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds,
  rating: (a, b) => {
    if (a.rating !== b.rating) {
      if (a.rating === null) return 1
      if (b.rating === null) return -1
      return b.rating - a.rating
    }
    return compareText(a.title, b.title)
  },
  title: (a, b) => compareText(a.title, b.title),
}

// The live recipes in each order, sorted the first time a snapshot is read
// in it, so a search filters a sorted list rather than sorting its matches.
const sortedCache = new WeakMap<Recipes, Map<SortBy, ReadonlyArray<Recipe>>>()

const sortedRecipes = (
  recipes: Recipes,
  sortBy: SortBy,
): ReadonlyArray<Recipe> => {
  let orders = sortedCache.get(recipes)
  if (orders === undefined) {
    orders = new Map()
    sortedCache.set(recipes, orders)
  }
  let sorted = orders.get(sortBy)
  if (sorted === undefined) {
    sorted = recipes.all
      .filter((recipe) => recipe.deletedAt === null)
      .sort(sorters[sortBy])
    orders.set(sortBy, sorted)
  }
  return sorted
}

// A recipe's title and ingredient names, case-folded once rather than on
// every keystroke. The names are joined with a character no query holds, so
// one substring test stands for a test of each name.
interface SearchText {
  readonly title: string
  readonly ingredients: string
}

const searchTextCache = new WeakMap<Recipe, SearchText>()

const searchText = (recipe: Recipe): SearchText => {
  let text = searchTextCache.get(recipe)
  if (text === undefined) {
    text = {
      title: foldCase(recipe.title),
      ingredients: recipe.ingredients
        .flatMap((component) =>
          component.ingredients.map((ingredient) => foldCase(ingredient.name)),
        )
        .join("\0"),
    }
    searchTextCache.set(recipe, text)
  }
  return text
}

// The recipe list, the meal plan drawer and the AI `SearchRecipes` tool all
// read through this. Soft-deleted recipes are left out. With a query, a title
// match scores 20 and an ingredient name match 10, and ties keep the sort.
// The result may be shared with other reads of the snapshot, so it must not
// be mutated.
export const searchRecipes = (
  recipes: Recipes,
  options: {
    readonly query: string
    readonly sortBy: SortBy
  },
): ReadonlyArray<Recipe> => {
  const sorted = sortedRecipes(recipes, options.sortBy)
  const query = foldCase(options.query.trim())
  if (query === "") return sorted
  // One list per score, each filled in sort order
  const both: Array<Recipe> = []
  const title: Array<Recipe> = []
  const ingredient: Array<Recipe> = []
  for (const recipe of sorted) {
    const text = searchText(recipe)
    const inTitle = text.title.includes(query)
    const inIngredients = text.ingredients.includes(query)
    if (inTitle && inIngredients) both.push(recipe)
    else if (inTitle) title.push(recipe)
    else if (inIngredients) ingredient.push(recipe)
  }
  return both.concat(title, ingredient)
}

// Decoding runs once per snapshot reload, however many reads share it.
const memoize = <A extends object, B>(f: (a: A) => B) => {
  const cache = new WeakMap<A, B>()
  return (a: A): B => {
    let b = cache.get(a)
    if (b === undefined) {
      b = f(a)
      cache.set(a, b)
    }
    return b
  }
}

export class RecipeRepo extends Context.Service<RecipeRepo>()(
  "cheffect/Recipes/Repo/RecipeRepo",
  {
    make: Effect.gen(function* () {
      const recipes = yield* makeSnapshot("recipes")
      const recipeEdits = yield* makeSnapshot("recipeEdits")
      const toRecipes = memoize(decodeRecipes)
      const toRecipeEdits = memoize(decodeRecipeEdits)

      const current = recipes.current.pipe(Effect.map(toRecipes))
      const currentEdits = recipeEdits.current.pipe(Effect.map(toRecipeEdits))

      return {
        current,
        stream: recipes.stream.pipe(Stream.map(toRecipes)),
        editsStream: recipeEdits.stream.pipe(Stream.map(toRecipeEdits)),
        // Live recipes, unsorted: for export and the dev seed.
        live: current.pipe(
          Effect.map(({ all }) => all.filter((r) => r.deletedAt === null)),
        ),
        byId: (id: string) =>
          current.pipe(Effect.map((recipes) => findRecipe(recipes, id))),
        search: (options: {
          readonly query: string
          readonly sortBy: SortBy
        }) =>
          current.pipe(
            Effect.map((recipes) => searchRecipes(recipes, options)),
          ),
        editById: (id: string) =>
          currentEdits.pipe(Effect.map((edits) => findRecipeEdit(edits, id))),
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
