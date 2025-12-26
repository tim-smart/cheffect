import * as Tool from "@effect/ai/Tool"
import * as Toolkit from "@effect/ai/Toolkit"
import * as Schema from "effect/Schema"
import { ExtractedRecipe, Recipe } from "./Recipe"
import { GroceryItem } from "./GroceryItem"
import { Menu } from "./Menu"
import { MenuEntry } from "./MenuEntry"
import { MealPlanEntry } from "./MealPlanEntry"
import { OpenAiTool } from "@effect/ai-openai"

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
    description: "Search the users recipe database by title",
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
    description: "Suggest edits to an existing recipe",
    parameters: {
      recipeId: Schema.String,
      recipe: ExtractedRecipe,
    },
    success: TransientResponse(Schema.Null),
  }),
  Tool.make("GetGroceryList", {
    description: "Get the user's full grocery list",
    success: TransientResponse(Schema.Array(GroceryItem.json)),
  }),
  Tool.make("AddGroceryItems", {
    description: "Add items to the user's grocery list",
    parameters: {
      groceryItems: Schema.Array(
        GroceryItem.jsonCreate.pipe(
          Schema.omit("completed", "createdAt", "updatedAt"),
        ),
      ),
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
) {}

export type ToolkitSuccess = Tool.Success<
  (typeof toolkit)["tools"][keyof (typeof toolkit)["tools"]]
>
