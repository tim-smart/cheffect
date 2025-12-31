import * as Tool from "@effect/ai/Tool"
import * as Toolkit from "@effect/ai/Toolkit"
import * as Schema from "effect/Schema"
import { ExtractedRecipe, Recipe } from "./Recipe"
import { GroceryItem } from "./GroceryItem"
import { Menu } from "./Menu"
import { MenuEntry } from "./MenuEntry"
import { MealPlanEntry } from "./MealPlanEntry"
import { OpenAiTool } from "@effect/ai-openai"
import { Model } from "@effect/sql"

export const TerminalResponse = <S extends Schema.Schema.Any>(
  schema: S,
): Schema.transform<
  S,
  Schema.TaggedStruct<"Terminal", { value: Schema.Schema<S["Type"]> }>
> =>
  Schema.transform(
    schema,
    Schema.TaggedStruct("Terminal", {
      value: Schema.typeSchema(schema),
    }),
    {
      decode: (value) => ({ _tag: "Terminal", value }) as const,
      encode: ({ value }) => value,
    },
  )

export const TransientResponse = <S extends Schema.Schema.Any>(
  schema: S,
): Schema.transform<
  S,
  Schema.TaggedStruct<"Transient", { value: Schema.Schema<S["Type"]> }>
> =>
  Schema.transform(
    schema,
    Schema.TaggedStruct("Transient", {
      value: Schema.typeSchema(schema),
    }),
    {
      decode: (value) => ({ _tag: "Transient", value }) as const,
      encode: ({ value }) => value,
    },
  )

export class toolkit extends Toolkit.make(
  OpenAiTool.WebSearch({}),
  Tool.make("SearchRecipes", {
    description: "Search the users recipe database by title and ingredients",
    parameters: {
      query: Schema.String,
    },
    success: TransientResponse(Schema.Array(Recipe.json)),
  }),
  Tool.make("RecipeById", {
    description: "Get a recipe by its unique ID",
    parameters: {
      id: Schema.String,
    },
    success: TransientResponse(Schema.NullOr(Recipe.json)),
  }),
  Tool.make("CreateRecipe", {
    description:
      "Create a new recipe from the provided information. Returns the new recipe ID.",
    parameters: {
      recipe: ExtractedRecipe,
    },
    success: TransientResponse(Schema.Struct({ recipeId: Schema.String })),
  }),
  Tool.make("SuggestRecipeEdit", {
    description:
      "Suggest edits to an existing recipe. The recipe parameter must contain ALL fields from the original recipe, not just the changed fields. Copy all existing values and only modify the specific fields that need to change.",
    parameters: {
      recipeId: Schema.String,
      recipe: ExtractedRecipe,
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("ScaleRecipe", {
    description:
      "Scale the ingredients of an existing recipe by a given factor",
    parameters: {
      recipeId: Schema.String,
      scale: Schema.Number.annotations({
        description:
          "The factor by which to scale the recipe (e.g., 2.0 to double, 0.5 to halve).",
      }),
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GroceryListNames", {
    description:
      "Get the names of all grocery lists the user has items added to",
    success: TransientResponse(Schema.Array(Schema.NullOr(Schema.String))),
  }),
  Tool.make("GetGroceryList", {
    description: "Get the user's full grocery list",
    parameters: {
      list: Schema.NullOr(Schema.String).annotations({
        description:
          "The name of the grocery list to retrieve. If null, retrieves the default list.",
      }),
    },
    success: TransientResponse(Schema.Array(GroceryItem.json)),
  }),
  Tool.make("AddGroceryItems", {
    description:
      "Add items to a grocery list. If the list is `null`, adds to the default list.",
    parameters: {
      groceryItems: Schema.Array(
        GroceryItem.jsonCreate.pipe(Schema.omit("completed")),
      ),
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("UpdateGroceryItem", {
    description: "Update an existing grocery item's name, quantity, or aisle",
    parameters: {
      groceryItemId: Schema.String,
      groceryItem: GroceryItem.jsonUpdate,
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("MergeGroceryItems", {
    description:
      "Merge multiple grocery items into one. Combines quantities and keeps the first item, deleting the others.",
    parameters: {
      targetId: Schema.String,
      sourceIds: Schema.Array(Schema.String),
      mergedName: Schema.NullOr(Schema.String),
      mergedQuantity: Schema.NullOr(Schema.String),
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("DeleteGroceryItem", {
    description: "Delete a grocery item from the list",
    parameters: {
      id: Schema.String,
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetMenus", {
    description: "Get the user's menus - collections of recipes",
    success: TransientResponse(Schema.Array(Menu.json)),
  }),
  Tool.make("CreateMenu", {
    description: "Create a new recipe from extracted recipe data",
    parameters: {
      menu: Menu.jsonCreate.pipe(Schema.omit("createdAt", "updatedAt")),
    },
    success: TransientResponse(Menu.json),
  }),
  Tool.make("AddMenuEntries", {
    description: "Add recipes to a specific menu",
    parameters: {
      menuId: Schema.String,
      menuEntries: Schema.Array(MenuEntry.jsonCreate),
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetMenuEntries", {
    description: "Get the recipes added to a specific menu",
    parameters: {
      menuId: Schema.String,
    },
    success: TransientResponse(Schema.Array(MenuEntry.json)),
  }),
  Tool.make("RemoveMenuEntry", {
    description: "Remove a recipe entry from a menu",
    parameters: {
      id: Schema.String,
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetCurrentMealPlan", {
    description:
      "Get the user's current meal plan entries for the current week",
    success: TransientResponse(Schema.Array(MealPlanEntry.json)),
  }),
  Tool.make("AddMealPlanEntries", {
    description: "Add entries to the user's meal plan",
    parameters: {
      mealPlanEntries: Schema.Array(
        Schema.Struct({
          recipeId: Schema.String,
          day: Model.Date.annotations({
            description:
              "The date for which to plan the meal (YYYY-MM-DD format). Time component is ignored.",
          }),
        }),
      ),
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("RemoveMealPlanEntry", {
    description: "Remove an entry from the user's meal plan",
    parameters: {
      id: Schema.String,
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("ImportRecipeFromUrl", {
    description:
      "Import a recipe from a URL. Queues a background job to fetch the webpage and extract recipe information. Returns a jobId for tracking the extraction progress.",
    parameters: {
      url: Schema.String,
    },
    success: TerminalResponse(Schema.Struct({ jobId: Schema.String })),
  }),
  Tool.make("SaveLearning", {
    description:
      "Save absolutely any information discovered during the conversation that could benefit future interactions. This includes user preferences, dietary restrictions, allergies, cooking skill level, household size, favorite cuisines, ingredient dislikes, kitchen equipment available, and any other relevant details. Keep notes concise to prevent exceeding token limits. Consolidate related information into single entries when possible.",
    parameters: {
      content: Schema.String.annotations({
        description: "The note in markdown format.",
      }),
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("RemoveLearning", {
    description: "Forget previously saved learning note.",
    parameters: {
      id: Schema.String.annotations({
        description: "The ID of the learning note to remove.",
      }),
    },
    success: TransientResponse(Schema.Null),
  }),
) {}

export type ToolkitSuccess = Tool.Success<
  (typeof toolkit)["tools"][keyof (typeof toolkit)["tools"]]
>
