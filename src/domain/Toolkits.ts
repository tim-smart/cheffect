import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"
import { ExtractedRecipe, Recipe, RecipeChanges } from "./Recipe"
import { GroceryItem } from "./GroceryItem"
import { Menu } from "./Menu"
import { MenuEntry } from "./MenuEntry"
import { MenuDayNote } from "./MenuDayNote"
import { MealPlanEntry } from "./MealPlanEntry"
import { MealPlanDayNote } from "./MealPlanDayNote"
import { OpenAiTool } from "@effect/ai-openai"
import * as Model from "effect/schema/Model"

const taggedResponse =
  <const Tag extends string>(tag: Tag) =>
  <A, I>(schema: Schema.Codec<A, I>) =>
    schema.pipe(
      Schema.decodeTo(
        Schema.Struct({
          _tag: Schema.tag(tag),
          value: Schema.toType(schema),
        }),
        SchemaTransformation.transform({
          decode: (value: A) => ({ _tag: tag, value }),
          encode: ({ value }) => value,
        }),
      ),
    )

export const TerminalResponse = taggedResponse("Terminal")

export const TransientResponse = taggedResponse("Transient")

export class toolkit extends Toolkit.make(
  OpenAiTool.WebSearch({}),
  Tool.make("SearchRecipes", {
    description:
      "Search the users recipe database by title and ingredients. Recipes with unsaved edits are returned as the user currently sees them.",
    parameters: Schema.Struct({
      query: Schema.String,
    }),
    success: TransientResponse(Schema.Array(Recipe.json)),
  }),
  Tool.make("RecipeById", {
    description:
      "Get a recipe by its unique ID, as the user currently sees it. Unsaved edits are included unless the user switched to the original.",
    parameters: Schema.Struct({
      id: Schema.String,
    }),
    success: TransientResponse(Schema.NullOr(Recipe.json)),
  }),
  Tool.make("CreateRecipe", {
    description:
      "Create a new recipe from the provided information. Returns the new recipe ID.",
    parameters: Schema.Struct({
      recipe: ExtractedRecipe,
    }),
    success: TransientResponse(Schema.Struct({ recipeId: Schema.String })),
  }),
  Tool.make("SuggestRecipeEdit", {
    description:
      "Suggest edits to an existing recipe. Only send the fields that change; the rest keep the values the user currently sees. The user reviews the edits before saving them.",
    parameters: Schema.Struct({
      recipeId: Schema.String,
      changes: RecipeChanges,
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("ScaleRecipe", {
    description:
      "Scale the ingredients of an existing recipe by a given factor",
    parameters: Schema.Struct({
      recipeId: Schema.String,
      scale: Schema.Finite.annotate({
        description:
          "The factor by which to scale the recipe (e.g., 2.0 to double, 0.5 to halve).",
      }),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GroceryListNames", {
    description:
      "Get the names of all grocery lists the user has items added to",
    success: TransientResponse(Schema.Array(Schema.NullOr(Schema.String))),
  }),
  Tool.make("GetGroceryList", {
    description: "Get the user's full grocery list",
    parameters: Schema.Struct({
      list: Schema.NullOr(Schema.String).annotate({
        description:
          "The name of the grocery list to retrieve. If null, retrieves the default list.",
      }),
    }),
    success: TransientResponse(Schema.Array(GroceryItem.json)),
  }),
  Tool.make("AddGroceryItems", {
    description:
      "Add items to a grocery list. If the list is `null`, adds to the default list.",
    parameters: Schema.Struct({
      groceryItems: Schema.Array(
        GroceryItem.jsonCreate.mapFields(Struct.omit(["completed"])),
      ),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("UpdateGroceryItem", {
    description: "Update an existing grocery item's name, quantity, or aisle",
    parameters: Schema.Struct({
      groceryItemId: Schema.String,
      groceryItem: GroceryItem.jsonUpdate,
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("MergeGroceryItems", {
    description:
      "Merge multiple grocery items into one. Combines quantities and keeps the first item, deleting the others.",
    parameters: Schema.Struct({
      targetId: Schema.String,
      sourceIds: Schema.Array(Schema.String),
      mergedName: Schema.NullOr(Schema.String),
      mergedQuantity: Schema.NullOr(Schema.String),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("DeleteGroceryItem", {
    description: "Delete a grocery item from the list",
    parameters: Schema.Struct({
      id: Schema.String,
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetMenus", {
    description: "Get the user's menus - collections of recipes",
    success: TransientResponse(Schema.Array(Menu.json)),
  }),
  Tool.make("CreateMenu", {
    description: "Create a new recipe from extracted recipe data",
    parameters: Schema.Struct({
      menu: Menu.jsonCreate.mapFields(Struct.omit(["createdAt", "updatedAt"])),
    }),
    success: TransientResponse(Menu.json),
  }),
  Tool.make("AddMenuEntries", {
    description: "Add recipes to a specific menu",
    parameters: Schema.Struct({
      menuId: Schema.String,
      menuEntries: Schema.Array(MenuEntry.jsonCreate),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetMenuEntries", {
    description:
      "Get the recipes added to a specific menu along with existing menu day notes",
    parameters: Schema.Struct({
      menuId: Schema.String,
    }),
    success: TransientResponse(
      Schema.Struct({
        entries: Schema.Array(MenuEntry.json),
        menuDayNotes: Schema.Array(MenuDayNote.json),
      }),
    ),
  }),
  Tool.make("SetMenuDayNote", {
    description:
      "Create or update a note for a menu day. Pass an empty note to remove the existing note.",
    parameters: Schema.Struct({
      menuId: Schema.String,
      day: Schema.Finite.annotate({
        description: "Menu day number to set the note for.",
      }),
      note: Schema.String.annotate({
        description: "Note content for the menu day (empty string removes it).",
      }),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("RemoveMenuEntry", {
    description: "Remove a recipe entry from a menu",
    parameters: Schema.Struct({
      id: Schema.String,
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetCurrentMealPlan", {
    description:
      "Get the user's current meal plan entries for the current week along with existing meal plan day notes",
    success: TransientResponse(
      Schema.Struct({
        entries: Schema.Array(MealPlanEntry.json),
        mealPlanDayNotes: Schema.Array(MealPlanDayNote.json),
      }),
    ),
  }),
  Tool.make("SetMealPlanDayNote", {
    description:
      "Create or update a note for a meal plan day. Pass an empty note to remove the existing note.",
    parameters: Schema.Struct({
      day: Model.Date.annotate({
        description: "Meal plan day date (YYYY-MM-DD format).",
      }),
      note: Schema.String.annotate({
        description:
          "Note content for the meal plan day (empty string removes it).",
      }),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("AddMealPlanEntries", {
    description: "Add entries to the user's meal plan",
    parameters: Schema.Struct({
      mealPlanEntries: Schema.Array(
        Schema.Struct({
          recipeId: Schema.String,
          day: Model.Date.annotate({
            description:
              "The date for which to plan the meal (YYYY-MM-DD format). Time component is ignored.",
          }),
        }),
      ),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("RemoveMealPlanEntry", {
    description: "Remove an entry from the user's meal plan",
    parameters: Schema.Struct({
      id: Schema.String,
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("ImportRecipeFromUrl", {
    description:
      "Import a recipe from a URL. Queues a background job to fetch the webpage and extract recipe information. Returns a jobId for tracking the extraction progress.",
    parameters: Schema.Struct({
      url: Schema.String,
    }),
    success: TerminalResponse(Schema.Struct({ jobId: Schema.String })),
  }),
  Tool.make("StartTimer", {
    description:
      "Start a countdown timer with a label and duration in minutes and/or seconds.",
    parameters: Schema.Struct({
      label: Schema.String.annotate({
        description: "Short label for the timer, like 'Boil pasta'.",
      }),
      duration: Schema.DurationFromMillis.annotate({
        description: "Timer duration in milliseconds (positive number).",
      }),
    }),
    success: TransientResponse(
      Schema.NullOr(
        Schema.Struct({
          timerId: Schema.String,
          label: Schema.String,
          durationMs: Schema.Finite,
        }),
      ),
    ),
  }),
  Tool.make("SaveLearning", {
    description:
      "Save absolutely any information discovered during the conversation that could benefit future interactions. This includes user preferences, dietary restrictions, allergies, cooking skill level, household size, favorite cuisines, ingredient dislikes, kitchen equipment available, and any other relevant details. Keep notes concise to prevent exceeding token limits. Consolidate related information into single entries when possible.",
    parameters: Schema.Struct({
      content: Schema.String.annotate({
        description: "The note in markdown format.",
      }),
    }),
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("RemoveLearning", {
    description: "Forget previously saved learning note.",
    parameters: Schema.Struct({
      id: Schema.String.annotate({
        description: "The ID of the learning note to remove.",
      }),
    }),
    success: TransientResponse(Schema.Null),
  }),
) {}

export type ToolkitSuccess = Tool.Success<
  (typeof toolkit)["tools"][keyof (typeof toolkit)["tools"]]
>
