import { test } from "node:test"
import * as assert from "node:assert/strict"
import { ExtractedRecipe, recipeToHtml } from "@/domain/Recipe"

const recipe = (sourceName: string | null, url?: string) =>
  new ExtractedRecipe({
    title: "Soup",
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [],
    steps: [],
    sourceName,
  }).asRecipe(url)

test("the exported recipe shows its source, linked when it has a URL", () => {
  assert.match(
    recipeToHtml(recipe("Grandma's notebook")),
    /<li><strong>Source:<\/strong> Grandma&#39;s notebook<\/li>/,
  )
  assert.match(
    recipeToHtml(recipe("AllRecipes", "https://example.com/soup")),
    /<li><strong>Source:<\/strong> <a href="https:\/\/example.com\/soup">AllRecipes<\/a><\/li>/,
  )
  assert.doesNotMatch(recipeToHtml(recipe(null)), /Source:/)
})
