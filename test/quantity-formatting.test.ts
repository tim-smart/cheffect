import { test } from "node:test"
import * as assert from "node:assert/strict"
import { Ingredient } from "@/domain/Recipe"
import { GroceryItem } from "@/domain/GroceryItem"
import { quantityFormatter } from "@/lib/utils"

const cases = [
  { quantity: 1 / 3, unit: "cup", number: "1/3", label: "1/3 cup" },
  { quantity: 1.5, unit: "tsp", number: "1 1/2", label: "1 1/2 tsp" },
  { quantity: 2 / 3, unit: "tbsp", number: "2/3", label: "2/3 tbsp" },
  { quantity: 1 / 3, unit: null, number: "1/3", label: "1/3" },
  { quantity: 1234.567, unit: "g", number: "1,234.57", label: "1,234.57g" },
  { quantity: 0, unit: "ml", number: "0", label: "0ml" },
  { quantity: null, unit: null, number: null, label: null },
] as const

test("ingredient quantities use simplified fractions and rounded decimals", () => {
  for (const { quantity, unit, number } of cases) {
    if (quantity !== null) {
      assert.equal(quantityFormatter.format(quantity, unit), number)
    }
  }
  assert.equal(quantityFormatter.format(4 / 3), "1.33")
})

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
