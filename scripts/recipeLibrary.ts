// A seeded library of made-up recipes for the benchmarks, shaped like an
// extracted one: two ingredient groups of six and eight steps each.

import * as Schema from "effect/Schema"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import { Ingredient, IngredientsComponent, Recipe, Step } from "@/domain/Recipe"
import { Rating } from "@/domain/Rating"
import { generateUuidBytes } from "@/lib/Id"
import { RecipeRow } from "@/Recipes/Table"

const words = [
  "chicken",
  "beef",
  "tofu",
  "lentil",
  "tomato",
  "garlic",
  "lemon",
  "ginger",
  "coconut",
  "mushroom",
  "spinach",
  "potato",
  "basil",
  "chilli",
  "honey",
  "pork",
  "salmon",
  "rice",
  "noodle",
  "pumpkin",
]
const dishes = ["curry", "soup", "salad", "stew", "pie", "bake", "stir fry"]
const units = ["g", "ml", "tsp", "tbsp", "cup", null] as const
// Photos the app serves itself, so the browser benchmark doesn't time the network
const photos = [
  "mobile-recipe",
  "mobile-recipes",
  "mobile-meal-plan",
  "desktop",
]

// A seeded generator, so every run times the same library. Ids are random.
let seed = 1
const random = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const pick = <A>(items: ReadonlyArray<A>): A =>
  items[Math.floor(random() * items.length)]!

const makeRecipe = (index: number): Recipe => {
  const now = DateTime.makeUnsafe(Date.UTC(2026, 0, 1) + index * 60_000)
  return new Recipe({
    id: generateUuidBytes() as Recipe["id"],
    title: `${pick(words)} ${pick(words)} ${pick(dishes)} ${index}`,
    imageUrl: `/screenshots/${pick(photos)}.jpg`,
    prepTime: Duration.minutes(5 + Math.floor(random() * 30)),
    cookingTime: Duration.minutes(10 + Math.floor(random() * 60)),
    servings: 2 + Math.floor(random() * 4),
    ingredients: Array.from(
      { length: 2 },
      (_, c) =>
        new IngredientsComponent({
          name: `Part ${c + 1}`,
          ingredients: Array.from(
            { length: 6 },
            () =>
              new Ingredient({
                name: `${pick(words)} ${pick(["fresh", "dried", "chopped", ""])}`,
                quantity: Math.ceil(random() * 200),
                unit: pick(units),
              }),
          ),
        }),
    ),
    steps: Array.from(
      { length: 8 },
      (_, s) =>
        new Step({
          text: `Step ${s + 1}: combine the ${pick(words)} with the ${pick(words)} and cook gently until the ${pick(words)} is tender and fragrant.`,
          tips: s % 3 === 0 ? ["Taste and season as you go."] : [],
        }),
    ),
    sourceName: "Example",
    sourceUrl: `https://example.com/${index}`,
    rating:
      random() < 0.5
        ? null
        : Schema.decodeSync(Rating)(1 + Math.floor(random() * 5)),
    ingredientScale: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: index % 50 === 0 ? now : null,
  })
}

export const makeLibrary = (count: number): ReadonlyArray<Recipe> => {
  seed = 1
  return Array.from({ length: count }, (_, i) => makeRecipe(i))
}

// The rows as IndexedDB stores them.
export const rowsSchema = Schema.Array(RecipeRow)
export const encodeRows = (recipes: ReadonlyArray<Recipe>) =>
  Schema.encodeSync(rowsSchema)(recipes.map((recipe) => ({ ...recipe })))
