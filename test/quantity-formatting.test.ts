import { test } from "node:test"
import * as assert from "node:assert/strict"
import { Ingredient } from "@/domain/Recipe"
import { GroceryItem } from "@/domain/GroceryItem"

const cases = [
  { quantity: 1 / 3, unit: "cup", label: "1/3 cup" },
  { quantity: 1.5, unit: "tsp", label: "1 1/2 tsp" },
  { quantity: 2 / 3, unit: "tbsp", label: "2/3 tbsp" },
  { quantity: 1 / 3, unit: null, label: "1/3" },
  { quantity: 1234.567, unit: "g", label: "1,234.57g" },
  { quantity: 0, unit: "ml", label: "0ml" },
  { quantity: null, unit: null, label: null },
] as const

test("recipe groceries use the ingredient list quantity labels", () => {
  const items = cases.map(({ quantity, unit }) =>
    GroceryItem.fromIngredient(
      null,
      new Ingredient({ name: "Test ingredient", quantity, unit }),
    ),
  )
  assert.deepEqual(
    items.map((item) => item.quantity),
    cases.map(({ label }) => label),
  )
})
