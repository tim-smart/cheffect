import { GroceryAisle, GroceryItem } from "@/domain/GroceryItem"
import { Rating } from "@/domain/Rating"
import {
  IngredientsComponent,
  Recipe,
  SortByValue,
  Step,
} from "@/domain/Recipe"
import { Model } from "@effect/sql"
import { Events, makeSchema, State } from "@livestore/livestore"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export const tables = {
  recipes: State.SQLite.table({
    name: "recipes",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      title: State.SQLite.text({ default: "" }),
      imageUrl: State.SQLite.text({ nullable: true }),
      prepTime: State.SQLite.real({
        nullable: true,
        schema: Schema.DurationFromMillis,
      }),
      cookingTime: State.SQLite.real({
        nullable: true,
        schema: Schema.DurationFromMillis,
      }),
      rating: State.SQLite.real({ nullable: true }),
      servings: State.SQLite.real({ nullable: true }),
      ingredients: State.SQLite.json({
        schema: Schema.Array(IngredientsComponent),
      }),
      steps: State.SQLite.json({ schema: Schema.Array(Step) }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
  }),
  recipeTags: State.SQLite.table({
    name: "recipe_tags",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      recipeId: State.SQLite.text({ nullable: false }),
      tag: State.SQLite.text({ nullable: false }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
  }),
  mealPlan: State.SQLite.table({
    name: "meal_plan",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      recipeId: State.SQLite.text({ nullable: false }),
      day: State.SQLite.text({
        nullable: false,
        schema: Model.Date,
      }),
    },
    indexes: [
      {
        name: "meal_plan_day_idx",
        columns: ["day"],
      },
    ],
  }),
  groceryItems: State.SQLite.table({
    name: "grocery_items",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      name: State.SQLite.text({ default: "" }),
      quantity: State.SQLite.text({ nullable: true }),
      aisle: State.SQLite.text({
        schema: GroceryAisle,
        nullable: true,
      }),
      completed: State.SQLite.boolean({ default: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
  }),
  settings: State.SQLite.table({
    name: "settings",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      value: State.SQLite.text({
        nullable: true,
      }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
  }),
  // Client documents can be used for local-only state (e.g. form inputs)
  searchState: State.SQLite.clientDocument({
    name: "searchState",
    schema: Schema.Struct({
      query: Schema.String,
      sortBy: SortByValue,
    }),
    default: { id: "~/searchState", value: { query: "", sortBy: "title" } },
  }),
}

// Events describe data changes (https://docs.livestore.dev/reference/events)
export const events = {
  recipeCreated: Events.synced({
    name: "v1.RecipeCreated",
    schema: Recipe,
  }),
  recipeUpdated: Events.synced({
    name: "v1.RecipeUpdated",
    schema: Recipe.update,
  }),
  recipeDeleted: Events.synced({
    name: "v1.RecipeDeleted",
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.DateTimeUtc }),
  }),
  mealPlanAdd: Events.synced({
    name: "v1.MealPlanAdd",
    schema: Schema.Struct({
      id: Schema.String,
      recipeId: Schema.String,
      day: Model.Date,
    }),
  }),
  mealPlanRemove: Events.synced({
    name: "v1.MealPlanRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  groceryItemAdded: Events.synced({
    name: "v1.GroceryItemAdded",
    schema: GroceryItem,
  }),
  groceryItemUpdated: Events.synced({
    name: "v1.GroceryItemUpdated",
    schema: GroceryItem.pipe(Schema.pick("id", "name", "aisle", "quantity")),
  }),
  groceryItemCleared: Events.synced({
    name: "v1.GroceryItemCleared",
    schema: Schema.Void,
  }),
  groceryItemClearedCompleted: Events.synced({
    name: "v1.GroceryItemClearedCompleted",
    schema: Schema.Void,
  }),
  groceryItemDeleted: Events.synced({
    name: "v1.GroceryItemDeleted",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  groceryItemToggled: Events.synced({
    name: "v1.GroceryItemToggled",
    schema: Schema.Struct({ id: Schema.String, completed: Schema.Boolean }),
  }),
  settingsSet: Events.synced({
    name: "v1.SettingsSet",
    schema: Schema.Struct({
      id: Schema.String,
      value: Schema.Option(Schema.Unknown),
    }),
  }),
  searchStateSet: tables.searchState.set,
}

// Materializers are used to map events to state (https://docs.livestore.dev/reference/state/materializers)
const materializers = State.SQLite.materializers(events, {
  "v1.RecipeCreated": (insert) => tables.recipes.insert(insert),
  "v1.RecipeUpdated": (update) =>
    tables.recipes.update(update).where({ id: update.id }),
  "v1.RecipeDeleted": ({ id, deletedAt }) =>
    tables.recipes.update({ deletedAt }).where({ id }),
  "v1.MealPlanAdd": (insert) => tables.mealPlan.insert(insert),
  "v1.MealPlanRemove": ({ id }) => tables.mealPlan.delete().where({ id }),
  "v1.GroceryItemAdded": (insert) => tables.groceryItems.insert(insert),
  "v1.GroceryItemUpdated": ({ id, ...update }) =>
    tables.groceryItems.update(update).where({ id }),
  "v1.GroceryItemCleared": () => tables.groceryItems.delete(),
  "v1.GroceryItemClearedCompleted": () =>
    tables.groceryItems.delete().where({ completed: true }),
  "v1.GroceryItemDeleted": ({ id }) =>
    tables.groceryItems.delete().where({ id }),
  "v1.GroceryItemToggled": ({ completed, id }) =>
    tables.groceryItems.update({ completed }).where({ id }),
  "v1.SettingsSet": ({ id, value }) => {
    const now = DateTime.unsafeNow()
    const encoded = value.pipe(
      Option.map((v) => JSON.stringify(v)),
      Option.getOrNull,
    )
    return tables.settings
      .insert({
        id,
        value: encoded,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict("id", "update", {
        value: encoded,
        updatedAt: now,
      })
  },
})

const state = State.SQLite.makeState({ tables, materializers })

export const schema = makeSchema({ events, state })

// ----

// ensure Recipe model is assignable to the recipes table
Schema.transform(tables.recipes.rowSchema, Schema.typeSchema(Recipe), {
  strict: true,
  decode: (row) =>
    new Recipe({
      ...row,
      rating: row.rating != null ? Rating.make(row.rating) : null,
    }),
  encode: (recipe) => recipe,
})

// ensure GroceryItem model is assignable to the table
Schema.transform(
  tables.groceryItems.rowSchema,
  Schema.typeSchema(GroceryItem),
  {
    strict: true,
    decode: (row) => new GroceryItem(row),
    encode: (item) => item,
  },
)
