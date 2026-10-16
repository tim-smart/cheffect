import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { ExtractedRecipe, RecipeEdit } from "@/domain/Recipe"
import {
  recipeEditsAtom,
  recipeForDisplayAtom,
  recipesAtom,
} from "@/Recipes/runtime"
import type { RecipeEdits } from "@/Recipes/Repo"

test("an edited recipe waits for edits to load instead of displaying the original", () => {
  const original = new ExtractedRecipe({
    title: "Original soup",
    imageUrl: "https://example.com/original.jpg",
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [],
    steps: [],
    sourceName: null,
  }).asRecipe()
  const edit = RecipeEdit.make({
    ...original,
    title: "Converted soup",
    imageUrl: null,
  })

  // Preload the two table snapshots independently, as IDB reads can finish in
  // either order. No browser, clock, or scheduling delay is involved.
  const display = (edits: AsyncResult.AsyncResult<RecipeEdits>) => {
    const registry = AtomRegistry.make({
      initialValues: [
        [
          recipesAtom,
          AsyncResult.success({
            all: [original],
            byId: new Map([[original.idString, original]]),
          }),
        ],
        [recipeEditsAtom, edits],
      ],
    })
    try {
      const result = registry.get(recipeForDisplayAtom(original.idString))
      return AsyncResult.isSuccess(result) && Option.isSome(result.value)
        ? {
            title: result.value.value.resolved.title,
            imageUrl: result.value.value.resolved.imageUrl,
            isModified: result.value.value.isModified,
          }
        : result._tag
    } finally {
      registry.dispose()
    }
  }

  assert.deepEqual(
    [
      display(AsyncResult.initial()),
      display(AsyncResult.success(new Map([[original.idString, edit]]))),
    ],
    ["Initial", { title: "Converted soup", imageUrl: null, isModified: true }],
  )
})
