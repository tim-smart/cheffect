import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { Recipe, type RecipeEdit, type SortBy } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"
import { isLive, stripLww } from "@/lib/Lww"
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

const decodeRecipes = (rows: ReadonlyArray<RecipeRow>): Recipes => {
  const all = rows.map((row) => new Recipe(stripLww(row)))
  return {
    all,
    byId: new Map(all.map((recipe) => [recipe.idString, recipe])),
  }
}

export type RecipeEdits = ReadonlyMap<string, typeof RecipeEdit.Type>

const decodeRecipeEdits = (rows: ReadonlyArray<RecipeEditRow>): RecipeEdits => {
  const edits = new Map<string, typeof RecipeEdit.Type>()
  for (const row of rows) {
    if (!isLive(row)) continue
    const { deleted: _, ...edit } = stripLww(row)
    edits.set(uuidString(edit.id), edit)
  }
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

// The recipe list, the meal plan drawer and the AI `SearchRecipes` tool all
// read through this. Soft-deleted recipes are left out. With a query, a title
// match scores 20 and an ingredient name match 10, and ties keep the sort.
export const searchRecipes = (
  recipes: Recipes,
  options: {
    readonly query: string
    readonly sortBy: SortBy
  },
): ReadonlyArray<Recipe> => {
  const live = recipes.all.filter((recipe) => recipe.deletedAt === null)
  const sort = sorters[options.sortBy]
  const query = foldCase(options.query.trim())
  if (query === "") return live.sort(sort)
  const weights = new Map<Recipe, number>()
  for (const recipe of live) {
    let weight = 0
    if (foldCase(recipe.title).includes(query)) weight += 20
    if (
      recipe.ingredients.some((component) =>
        component.ingredients.some((ingredient) =>
          foldCase(ingredient.name).includes(query),
        ),
      )
    ) {
      weight += 10
    }
    if (weight > 0) weights.set(recipe, weight)
  }
  return Array.from(weights.keys()).sort(
    (a, b) => weights.get(b)! - weights.get(a)! || sort(a, b),
  )
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
