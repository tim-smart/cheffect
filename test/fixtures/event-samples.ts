import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Prompt from "effect/ai/Prompt"
import { AiChatTurnEvent, AiMemoryEntryEvent } from "@/AiChat/Events"
import type { EventPayload } from "@/EventLog"
import {
  GroceryAisleOrderEvent,
  GroceryItemEvent,
  IngredientAisleEvent,
} from "@/Groceries/Events"
import { MealPlanDayNoteEvent, MealPlanEntryEvent } from "@/MealPlan/Events"
import { MenuDayNoteEvent, MenuEntryEvent, MenuEvent } from "@/Menus/Events"
import { RecipeEditEvent, RecipeEvent } from "@/Recipes/Events"
import { SettingEvent } from "@/Settings/Events"
import { TimerEvent } from "@/Timers/Events"
import { AiChatTurnIdFromString } from "@/domain/AiChatTurn"
import {
  AiMemoryEntry,
  AiMemoryEntryIdFromString,
} from "@/domain/AiMemoryEntry"
import { GroceryItem, GroceryItemIdFromString } from "@/domain/GroceryItem"
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

// A `set`, a `patch` and a `remove` per row event, for
// `scripts/capture-event-fixtures.ts`. Sets fill every field, with non-null
// values where a field is nullable, and patches write every field a patch
// can, so the captured bytes cover each field's encoding.

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)
const createdAt = DateTime.makeUnsafe(1_760_000_000_000)
const updatedAt = DateTime.makeUnsafe(1_760_000_600_000)

const extracted = {
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
const timer = Timer.insert.make({
  id: timerId,
  label: "Carrot soup",
  duration: Duration.minutes(40),
  expiresAt: DateTime.makeUnsafe(1_760_002_400_000),
  pausedRemaining: Duration.minutes(25),
  createdAt,
  updatedAt: createdAt,
})

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

const groceryItemId = Schema.decodeSync(GroceryItemIdFromString)(
  "0193c7a0-1b2c-4def-8123-c0ffee000001",
)

const aiMemoryEntryId = Schema.decodeSync(AiMemoryEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-a1000000000a",
)

const aiChatTurnId = Schema.decodeSync(AiChatTurnIdFromString)(
  "0193c7a0-1b2c-4def-8123-a2000000000a",
)

// A finished turn's messages as a JSON string, file parts stripped: the
// question, a tool call and its result, and the answer.
const aiChatTurnPrompt = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(Prompt.Prompt)),
)(
  Prompt.make([
    {
      role: "user",
      content: [{ type: "text", text: "What can I make with carrots?" }],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          id: "call_1",
          name: "SearchRecipes",
          params: { query: "carrot" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          id: "call_1",
          name: "SearchRecipes",
          isFailure: false,
          result: [
            {
              id: "0193c7a0-1b2c-4def-8123-456789abcdef",
              title: "Carrot soup",
            },
          ],
        },
      ],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "You could make carrot soup." }],
    },
  ]),
)

// A whole recipe, for tests that need one written.
export const sampleRecipe = Recipe.make({
  ...extracted,
  ingredientScale: 1,
  rating: Rating.make(4),
  sourceUrl: "https://example.com/carrot-soup",
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
})

const menuEntry = MenuEntry.insert.make({
  id: menuEntryId,
  menuId,
  recipeId,
  day: 1,
  createdAt,
  updatedAt: createdAt,
})

const menuDayNote = MenuDayNote.insert.make({
  id: menuDayNoteId,
  menuId,
  day: 2,
  note: "Make extra for lunches",
  createdAt,
  updatedAt: createdAt,
})

const recipeKey = { id: recipeId }

// A patch never writes the key.
const { id: _, ...extractedFields } = extracted

export const eventSamples: ReadonlyArray<EventPayload> = [
  { event: RecipeEvent.tag, payload: RecipeEvent.set(sampleRecipe) },
  {
    event: RecipeEvent.tag,
    payload: RecipeEvent.patch(recipeKey, {
      ...extractedFields,
      title: "Carrot and coriander soup",
      ingredientScale: 2,
      rating: Rating.make(5),
      sourceUrl: "https://example.com/carrot-coriander-soup",
      createdAt,
      updatedAt,
      deletedAt: updatedAt,
    }),
  },
  { event: RecipeEvent.tag, payload: RecipeEvent.remove(recipeKey) },
  {
    event: RecipeEditEvent.tag,
    payload: RecipeEditEvent.set(
      RecipeEdit.make({ ...extracted, title: "Carrot and ginger soup" }),
    ),
  },
  {
    event: RecipeEditEvent.tag,
    payload: RecipeEditEvent.patch(recipeKey, {
      ...extractedFields,
      title: "Carrot, ginger and lime soup",
    }),
  },
  { event: RecipeEditEvent.tag, payload: RecipeEditEvent.remove(recipeKey) },
  {
    event: SettingEvent.tag,
    payload: SettingEvent.set({ id: "aiCountry", value: settingValue }),
  },
  {
    event: SettingEvent.tag,
    payload: SettingEvent.patch("aiCountry", { value: settingValue }),
  },
  { event: SettingEvent.tag, payload: SettingEvent.remove("aiCountry") },
  { event: TimerEvent.tag, payload: TimerEvent.set(timer) },
  {
    event: TimerEvent.tag,
    payload: TimerEvent.patch(timer, {
      label: "Carrot soup, second batch",
      duration: Duration.minutes(45),
      expiresAt: DateTime.makeUnsafe(1_760_002_700_000),
      pausedRemaining: Duration.minutes(10),
      createdAt,
      updatedAt,
    }),
  },
  {
    event: TimerEvent.tag,
    payload: TimerEvent.remove(timer),
  },
  {
    event: MealPlanEntryEvent.tag,
    payload: MealPlanEntryEvent.set({
      id: mealPlanEntryId,
      recipeId,
      day: monday,
    }),
  },
  {
    event: MealPlanEntryEvent.tag,
    payload: MealPlanEntryEvent.patch(
      { id: mealPlanEntryId },
      { recipeId, day: tuesday },
    ),
  },
  {
    event: MealPlanEntryEvent.tag,
    payload: MealPlanEntryEvent.remove({ id: mealPlanEntryId }),
  },
  {
    event: MealPlanDayNoteEvent.tag,
    payload: MealPlanDayNoteEvent.set(
      MealPlanDayNote.insert.make({
        id: mealPlanDayNoteId,
        day: monday,
        note: "Leftovers for lunch",
        createdAt,
        updatedAt: createdAt,
      }),
    ),
  },
  {
    event: MealPlanDayNoteEvent.tag,
    payload: MealPlanDayNoteEvent.patch(
      { id: mealPlanDayNoteId },
      { day: tuesday, note: "Eating out", createdAt, updatedAt },
    ),
  },
  {
    event: MealPlanDayNoteEvent.tag,
    payload: MealPlanDayNoteEvent.remove({ id: mealPlanDayNoteId }),
  },
  {
    event: MenuEvent.tag,
    payload: MenuEvent.set(
      Menu.insert.make({
        id: menuId,
        name: "Winter warmers",
        days: 7,
        createdAt,
        updatedAt: createdAt,
      }),
    ),
  },
  {
    event: MenuEvent.tag,
    payload: MenuEvent.patch(
      { id: menuId },
      {
        name: "Winter favourites",
        days: 5,
        createdAt,
        updatedAt,
      },
    ),
  },
  {
    event: MenuEvent.tag,
    payload: MenuEvent.remove({ id: menuId }),
  },
  { event: MenuEntryEvent.tag, payload: MenuEntryEvent.set(menuEntry) },
  {
    event: MenuEntryEvent.tag,
    payload: MenuEntryEvent.patch(menuEntry, {
      recipeId,
      day: 3,
      createdAt,
      updatedAt,
    }),
  },
  {
    event: MenuEntryEvent.tag,
    payload: MenuEntryEvent.remove(menuEntry),
  },
  { event: MenuDayNoteEvent.tag, payload: MenuDayNoteEvent.set(menuDayNote) },
  {
    event: MenuDayNoteEvent.tag,
    payload: MenuDayNoteEvent.patch(menuDayNote, {
      day: 4,
      note: "Freeze half",
      createdAt,
      updatedAt,
    }),
  },
  {
    event: MenuDayNoteEvent.tag,
    payload: MenuDayNoteEvent.remove(menuDayNote),
  },
  {
    event: GroceryItemEvent.tag,
    payload: GroceryItemEvent.set(
      GroceryItem.make({
        id: groceryItemId,
        list: "Weekend",
        name: "Carrots",
        quantity: "500 g",
        aisle: "Produce",
        recipeIds: [recipeId],
        completed: false,
        createdAt,
        updatedAt: createdAt,
      }),
    ),
  },
  {
    event: GroceryItemEvent.tag,
    payload: GroceryItemEvent.patch(
      { id: groceryItemId },
      {
        list: "Pantry",
        name: "Baby carrots",
        quantity: "1 kg",
        aisle: "Produce",
        recipeIds: [recipeId],
        completed: true,
        createdAt,
        updatedAt,
      },
    ),
  },
  {
    event: GroceryItemEvent.tag,
    payload: GroceryItemEvent.remove({ id: groceryItemId }),
  },
  {
    event: IngredientAisleEvent.tag,
    payload: IngredientAisleEvent.set({ name: "carrots", aisle: "Produce" }),
  },
  {
    event: IngredientAisleEvent.tag,
    payload: IngredientAisleEvent.patch(
      { name: "carrots" },
      { aisle: "Pantry" },
    ),
  },
  {
    event: IngredientAisleEvent.tag,
    payload: IngredientAisleEvent.remove({ name: "carrots" }),
  },
  {
    event: GroceryAisleOrderEvent.tag,
    payload: GroceryAisleOrderEvent.set({
      list: "Weekend",
      aisle: "Produce",
      sortOrder: 2,
      updatedAt,
    }),
  },
  {
    event: GroceryAisleOrderEvent.tag,
    payload: GroceryAisleOrderEvent.patch(
      { list: "Weekend", aisle: "Produce" },
      { sortOrder: 3, updatedAt },
    ),
  },
  {
    event: GroceryAisleOrderEvent.tag,
    payload: GroceryAisleOrderEvent.remove({
      list: "Weekend",
      aisle: "Produce",
    }),
  },
  {
    event: AiMemoryEntryEvent.tag,
    payload: AiMemoryEntryEvent.set(
      AiMemoryEntry.insert.make({
        id: aiMemoryEntryId,
        content: "Prefers metric units",
        createdAt,
      }),
    ),
  },
  {
    event: AiMemoryEntryEvent.tag,
    payload: AiMemoryEntryEvent.patch(
      { id: aiMemoryEntryId },
      { content: "Prefers metric units and fan-forced ovens", createdAt },
    ),
  },
  {
    event: AiMemoryEntryEvent.tag,
    payload: AiMemoryEntryEvent.remove({ id: aiMemoryEntryId }),
  },
  {
    event: AiChatTurnEvent.tag,
    payload: AiChatTurnEvent.set({
      id: aiChatTurnId,
      prompt: aiChatTurnPrompt,
      entryTime: 1_760_000_900_000,
    }),
  },
  {
    event: AiChatTurnEvent.tag,
    payload: AiChatTurnEvent.patch(
      { id: aiChatTurnId },
      { prompt: aiChatTurnPrompt, entryTime: 1_760_001_000_000 },
    ),
  },
  {
    event: AiChatTurnEvent.tag,
    payload: AiChatTurnEvent.remove({ id: aiChatTurnId }),
  },
]
