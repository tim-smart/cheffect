import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import {
  ExtractedRecipe,
  Ingredient,
  IngredientsComponent,
  Recipe,
} from "@/domain/Recipe"
import { searchRecipes, type Recipes } from "@/Recipes/Repo"
import {
  allRecipesAtom,
  recipeEditsAtom,
  recipesAtom,
  recipeSortByAtom,
} from "@/Recipes/runtime"

test("the recipe list remains usable when edits fail to load", () => {
  const recipe = new ExtractedRecipe({
    title: "Soup",
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [],
    steps: [],
    sourceName: null,
  }).asRecipe()
  const registry = AtomRegistry.make({
    initialValues: [
      [
        recipesAtom,
        AsyncResult.success({
          all: [recipe],
          byId: new Map([[recipe.idString, recipe]]),
        }),
      ],
      [
        recipeEditsAtom,
        AsyncResult.failure(Cause.die(new Error("Edits read failed"))),
      ],
      [recipeSortByAtom, "title"],
    ],
  })
  try {
    const result = registry.get(allRecipesAtom)
    assert.equal(result._tag, "Success")
    if (AsyncResult.isSuccess(result)) {
      assert.deepEqual(result.value, [recipe])
    }
  } finally {
    registry.dispose()
  }
})

const makeRecipe = (
  title: string,
  options: {
    readonly ingredients?: ReadonlyArray<string>
    readonly createdAt?: number
    readonly deleted?: boolean
  } = {},
) => {
  const recipe = new ExtractedRecipe({
    title,
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [
      new IngredientsComponent({
        name: "Main",
        ingredients: (options.ingredients ?? []).map(
          (name) => new Ingredient({ name, quantity: null, unit: null }),
        ),
      }),
    ],
    steps: [],
    sourceName: null,
  }).asRecipe()
  const createdAt = DateTime.makeUnsafe(options.createdAt ?? 0)
  return new Recipe({
    ...recipe,
    createdAt,
    deletedAt: options.deleted ? createdAt : null,
  })
}

const snapshot = (all: ReadonlyArray<Recipe>): Recipes => ({
  all,
  byId: new Map(all.map((recipe) => [recipe.idString, recipe])),
})

test("a search ranks title and ingredient matches, each in the sort order", () => {
  const soup = makeRecipe("Chicken soup")
  const curry = makeRecipe("Chicken curry", { ingredients: ["Chicken thigh"] })
  const bake = makeRecipe("chicken bake")
  const rice = makeRecipe("Fried rice", { ingredients: ["Diced CHICKEN"] })
  const stew = makeRecipe("Beef stew", { ingredients: ["Beef"] })
  const pie = makeRecipe("Chicken pie", { deleted: true })
  const recipes = snapshot([soup, curry, bake, rice, stew, pie])

  const titles = (query: string) =>
    searchRecipes(recipes, { query, sortBy: "title" }).map((r) => r.title)
  assert.deepEqual(titles(" Chicken "), [
    "Chicken curry",
    "chicken bake",
    "Chicken soup",
    "Fried rice",
  ])
  assert.deepEqual(titles(""), [
    "Beef stew",
    "chicken bake",
    "Chicken curry",
    "Chicken soup",
    "Fried rice",
  ])
})

test("a snapshot searched in one order still sorts by another", () => {
  const older = makeRecipe("Apple pie", { createdAt: 1 })
  const newer = makeRecipe("Banana bread", { createdAt: 2 })
  const recipes = snapshot([older, newer])

  const titles = (sortBy: "title" | "createdAt") =>
    searchRecipes(recipes, { query: "", sortBy }).map((r) => r.title)
  assert.deepEqual(titles("title"), ["Apple pie", "Banana bread"])
  assert.deepEqual(titles("createdAt"), ["Banana bread", "Apple pie"])
  assert.deepEqual(titles("title"), ["Apple pie", "Banana bread"])
})
