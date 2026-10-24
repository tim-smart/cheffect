import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as HashSet from "effect/HashSet"
import {
  defaultGrocerySelection,
  groceryCandidates,
  selectedGroceryItems,
} from "@/Groceries/candidates"
import {
  ExtractedRecipe,
  Ingredient,
  IngredientsComponent,
} from "@/domain/Recipe"

const recipe = (title: string, ingredients: ReadonlyArray<string>) =>
  new ExtractedRecipe({
    title,
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [
      new IngredientsComponent({
        name: "Ingredients",
        ingredients: ingredients.map(
          (name) => new Ingredient({ name, quantity: null, unit: null }),
        ),
      }),
    ],
    steps: [],
    sourceName: null,
  }).asRecipe()

test("pantry items and ingredients ticked off on their recipe start unselected", () => {
  const soup = recipe("Carrot soup", ["Carrots", "Onion", "Salt"])
  const salad = recipe("Salad", ["Lettuce", "Onion", "Salt"])
  const groups = groceryCandidates([soup, salad], {
    pantryNames: new Set(["salt"]),
    // Onion is ticked off on the soup only.
    ticked: (r) => (r === soup ? HashSet.make("0-1") : HashSet.empty()),
  })
  const items = selectedGroceryItems(groups, defaultGrocerySelection(groups))
  assert.deepEqual(
    items.map((item) => item.name),
    ["Carrots", "Lettuce", "Onion"],
  )
})
