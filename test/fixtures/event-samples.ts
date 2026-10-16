import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Schema from "effect/Schema"
import type { EventPayload } from "@/EventLog"
import { Rating } from "@/domain/Rating"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeEdit,
  RecipeIdFromString,
  Step,
} from "@/domain/Recipe"

// One or more payloads per event tag, for `scripts/capture-event-fixtures.ts`.
// Samples fill every field, with non-null values where a field is nullable,
// so the captured bytes cover each field's encoding.

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)
const createdAt = DateTime.makeUnsafe(1_760_000_000_000)
const updatedAt = DateTime.makeUnsafe(1_760_000_600_000)

const recipe = {
  id: recipeId,
  title: "Carrot soup",
  imageUrl: "https://example.com/carrot-soup.jpg",
  prepTime: Duration.minutes(15),
  cookingTime: Duration.minutes(40),
  servings: 4,
  ingredients: [
    new IngredientsComponent({
      name: "Soup",
      ingredients: [
        new Ingredient({ name: "Carrots", quantity: 500, unit: "g" }),
        new Ingredient({ name: "Vegetable stock", quantity: 1.5, unit: "l" }),
        new Ingredient({ name: "Salt", quantity: null, unit: null }),
      ],
    }),
  ],
  steps: [
    new Step({
      text: "Simmer the carrots in the stock until soft.",
      tips: ["Cut the carrots small so they cook evenly."],
    }),
    new Step({ text: "Blend until smooth.", tips: [] }),
  ],
  sourceName: "Example Kitchen",
}

export const eventSamples: ReadonlyArray<EventPayload> = [
  {
    event: "RecipeCreated",
    payload: Recipe.insert.make({
      ...recipe,
      rating: Rating.make(4),
      sourceUrl: "https://example.com/carrot-soup",
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    }),
  },
  {
    event: "RecipeUpdated",
    payload: Recipe.update.make({
      ...recipe,
      rating: Rating.make(5),
      sourceUrl: "https://example.com/carrot-soup",
      ingredientScale: 2,
      updatedAt,
      deletedAt: null,
    }),
  },
  {
    event: "RecipeSetIngredientScale",
    payload: { id: recipeId, ingredientScale: 1.5, updatedAt },
  },
  {
    event: "RecipeDeleted",
    payload: { id: recipeId, deletedAt: updatedAt },
  },
  {
    event: "RecipeEditSet",
    payload: RecipeEdit.make({ ...recipe, title: "Carrot and ginger soup" }),
  },
  {
    event: "RecipeEditRemove",
    payload: { id: recipeId },
  },
]
