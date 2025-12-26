import * as Tool from "@effect/ai/Tool"
import * as Toolkit from "@effect/ai/Toolkit"
import * as Schema from "effect/Schema"
import { Recipe } from "./Recipe"
import { GroceryItem } from "./GroceryItem"
import { Menu } from "./Menu"
import { MenuEntry } from "./MenuEntry"
import { MealPlanEntry } from "./MealPlanEntry"

export class RecipeCreated extends Schema.TaggedClass<RecipeCreated>(
  "RecipeCreated",
)("RecipeCreated", {
  recipe: Recipe.json,
}) {}

export class GroceryItemsCreated extends Schema.TaggedClass<GroceryItemsCreated>(
  "GroceryItemsCreated",
)("GroceryItemsCreated", {
  groceryItems: Schema.Array(GroceryItem.json),
}) {}

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
    description: "Create a new recipe from extracted recipe data",
    parameters: {
      recipe: Recipe.jsonCreate.pipe(Schema.omit("rating")),
    },
    success: TerminalResponse(RecipeCreated),
  }),
  Tool.make("SuggestRecipeEdit", {
    description: "Suggest edits to an existing recipe",
    parameters: {
      recipeId: Schema.String,
      recipe: Recipe.jsonUpdate,
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
    success: TerminalResponse(GroceryItemsCreated),
  }),
  Tool.make("GetMenus", {
    description: "Get the user's menus - collections of recipes",
    success: TransientResponse(Schema.Array(Menu.json)),
  }),
  Tool.make("GetMenuEntries", {
    description: "Get the recipes added to a specific menu",
    parameters: {
      menuId: Schema.String,
    },
    success: TransientResponse(Schema.Array(MenuEntry.json)),
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
