import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { recipesFromPaprika } from "@/Recipes/paprika"

// A Paprika export is a zip of gzipped JSON recipes with plain-text
// ingredients and directions. `export.paprikarecipes` holds two: a carrot cake
// using every format the text parsing handles, and a toast with only the
// required fields filled in. Both have a Paprika photo, and only the cake also
// has a web image.

const exportFile = new Uint8Array(
  readFileSync(
    new URL("./fixtures/paprika/export.paprikarecipes", import.meta.url),
  ),
)

const minutes = (d: Duration.Duration | null) =>
  d === null ? null : Duration.toMinutes(d)

test("a Paprika export imports as recipes, with the same ids every time", async () => {
  const {
    recipes: [cake, toast],
    photosLeftOut,
  } = await Effect.runPromise(recipesFromPaprika(exportFile))

  assert.equal(cake.title, "Carrot Cake")
  assert.deepEqual(
    cake.ingredients.map((group) => ({
      name: group.name,
      ingredients: group.ingredients.map(({ name, quantity, unit }) => ({
        name,
        quantity,
        unit,
      })),
    })),
    [
      {
        name: "Cake",
        ingredients: [
          { name: "flour", quantity: 1.5, unit: "cup" },
          { name: "milk", quantity: 1.5, unit: "cup" },
          { name: "vanilla", quantity: 2, unit: "tsp" },
          { name: "sugar", quantity: 2, unit: "tbsp" },
          { name: "eggs", quantity: 2, unit: null },
          { name: "can of chickpeas", quantity: 1, unit: null },
        ],
      },
      {
        name: "Frosting",
        ingredients: [
          { name: "cream cheese", quantity: 225, unit: "g" },
          { name: "pinch of salt", quantity: null, unit: null },
        ],
      },
    ],
  )
  assert.deepEqual(
    cake.steps.map((step) => step.text),
    ["Preheat the oven.", "Mix the flour and sugar."],
  )
  assert.equal(minutes(cake.prepTime), 20)
  assert.equal(minutes(cake.cookingTime), 65)
  assert.equal(cake.servings, 8)
  assert.equal(cake.rating, 5)
  assert.equal(cake.sourceName, "Example Kitchen")
  assert.equal(cake.sourceUrl, "https://example.com/carrot-cake")
  assert.equal(cake.imageUrl, "https://example.com/carrot-cake.jpg")
  assert.equal(DateTime.formatIso(cake.createdAt), "2020-01-02T03:04:05.000Z")

  // Empty fields, a rating of 0 and an image only on the phone come through
  // as unset.
  assert.equal(toast.title, "Toast")
  assert.equal(toast.ingredients[0].ingredients[0].name, "bread")
  assert.equal(toast.steps[0].text, "Toast the bread")
  assert.equal(toast.prepTime, null)
  assert.equal(toast.servings, null)
  assert.equal(toast.rating, null)
  assert.equal(toast.sourceName, null)
  assert.equal(toast.imageUrl, null)
  assert.deepEqual([...photosLeftOut], [toast.idString])

  const again = await Effect.runPromise(recipesFromPaprika(exportFile))
  assert.deepEqual(
    again.recipes.map((recipe) => recipe.idString),
    [cake.idString, toast.idString],
  )
  assert.notEqual(cake.idString, toast.idString)
})

test("a file that isn't a Paprika export imports nothing", async () => {
  const error = await Effect.runPromise(
    Effect.flip(recipesFromPaprika(new TextEncoder().encode("[]"))),
  )
  assert.equal(error.message, "Not a Paprika export")
})
