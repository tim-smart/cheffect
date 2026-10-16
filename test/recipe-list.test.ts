import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { ExtractedRecipe } from "@/domain/Recipe"
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
