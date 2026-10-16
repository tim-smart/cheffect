import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { EventPayload } from "@/EventLog"
import {
  MealPlanDayNote,
  MealPlanDayNoteIdFromString,
} from "@/domain/MealPlanDayNote"
import { MealPlanEntryIdFromString } from "@/domain/MealPlanEntry"
import { Menu, MenuIdFromString } from "@/domain/Menu"
import { MenuDayNote, MenuDayNoteIdFromString } from "@/domain/MenuDayNote"
import { MenuEntry, MenuEntryIdFromString } from "@/domain/MenuEntry"
import { Rating } from "@/domain/Rating"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeEdit,
  RecipeIdFromString,
  Step,
} from "@/domain/Recipe"
import { Timer, TimerIdFromString } from "@/domain/Timer"

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

const timerId = Schema.decodeSync(TimerIdFromString)(
  "0193c7a0-1b2c-4def-8123-fedcba987654",
)
const timer = {
  id: timerId,
  label: "Carrot soup",
  duration: Duration.minutes(40),
  expiresAt: DateTime.makeUnsafe(1_760_002_400_000),
  pausedRemaining: Duration.minutes(25),
}

// A setting's value is its encoded `Option` as a JSON string.
const settingValue = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(Schema.Option(Schema.String))),
)(Option.some("NZ"))

const mealPlanEntryId = Schema.decodeSync(MealPlanEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-0123456789ab",
)
const mealPlanDayNoteId = Schema.decodeSync(MealPlanDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-ba9876543210",
)
// Meal plan days are dates without a time.
const monday = DateTime.makeUnsafe("2025-10-13")
const tuesday = DateTime.makeUnsafe("2025-10-14")

const menuId = Schema.decodeSync(MenuIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f6",
)
const menuEntryId = Schema.decodeSync(MenuEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f7",
)
const menuDayNoteId = Schema.decodeSync(MenuDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1b2c3d4e5f8",
)

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
  {
    event: "SettingsSet",
    payload: { id: "aiCountry", value: settingValue },
  },
  {
    event: "TimerAdded",
    payload: Timer.insert.make({ ...timer, createdAt, updatedAt: createdAt }),
  },
  {
    event: "TimerUpdated",
    payload: Timer.update.make({ ...timer, updatedAt }),
  },
  {
    event: "TimerDeleted",
    payload: { id: timerId },
  },
  {
    event: "MealPlanAdd",
    payload: { id: mealPlanEntryId, recipeId, day: monday },
  },
  {
    event: "MealPlanSetDay",
    payload: { id: mealPlanEntryId, day: tuesday },
  },
  {
    event: "MealPlanRemove",
    payload: { id: mealPlanEntryId },
  },
  {
    event: "MealPlanDayNoteAdd",
    payload: MealPlanDayNote.insert.make({
      id: mealPlanDayNoteId,
      day: monday,
      note: "Leftovers for lunch",
      createdAt,
      updatedAt: createdAt,
    }),
  },
  {
    event: "MealPlanDayNoteUpdate",
    payload: MealPlanDayNote.update.make({
      id: mealPlanDayNoteId,
      day: monday,
      note: "Eating out",
      updatedAt,
    }),
  },
  {
    event: "MealPlanDayNoteRemove",
    payload: { id: mealPlanDayNoteId },
  },
  {
    event: "MenuAdd",
    payload: Menu.insert.make({
      id: menuId,
      name: "Winter warmers",
      days: 7,
      createdAt,
      updatedAt: createdAt,
    }),
  },
  {
    event: "MenuUpdate",
    payload: Menu.update.make({
      id: menuId,
      name: "Winter favourites",
      days: 5,
      updatedAt,
    }),
  },
  {
    event: "MenuRemove",
    payload: { id: menuId },
  },
  {
    event: "MenuEntryAdd",
    payload: MenuEntry.insert.make({
      id: menuEntryId,
      menuId,
      recipeId,
      day: 1,
      createdAt,
      updatedAt: createdAt,
    }),
  },
  {
    event: "MenuEntrySetDay",
    payload: { id: menuEntryId, day: 3, updatedAt },
  },
  {
    event: "MenuEntryRemove",
    payload: { id: menuEntryId },
  },
  {
    event: "MenuDayNoteAdd",
    payload: MenuDayNote.insert.make({
      id: menuDayNoteId,
      menuId,
      day: 2,
      note: "Make extra for lunches",
      createdAt,
      updatedAt: createdAt,
    }),
  },
  {
    event: "MenuDayNoteUpdate",
    payload: MenuDayNote.update.make({
      id: menuDayNoteId,
      day: 2,
      note: "Freeze half",
      updatedAt,
    }),
  },
  {
    event: "MenuDayNoteRemove",
    payload: { id: menuDayNoteId },
  },
]
