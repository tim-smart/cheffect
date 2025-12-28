import { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { GroceryAisle, GroceryItem } from "../domain/GroceryItem"
import { Menu } from "../domain/Menu"
import { MenuEntry } from "../domain/MenuEntry"
import { Rating } from "../domain/Rating"
import {
  IngredientsComponent,
  Recipe,
  RecipeEdit,
  SortByValue,
  Step,
} from "../domain/Recipe"
import { Model } from "@effect/sql"
import { Events, makeSchema, State } from "@livestore/livestore"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const recipeColumns = {
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
  sourceName: State.SQLite.text({ nullable: true }),
  sourceUrl: State.SQLite.text({ nullable: true }),
} as const

export const tables = {
  recipes: State.SQLite.table({
    name: "recipes",
    columns: {
      ...recipeColumns,
      ingredientScale: State.SQLite.real({ default: 1 }),
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
  recipeEdits: State.SQLite.table({
    name: "recipe_edits",
    columns: recipeColumns,
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
  recipeExtractJobs: State.SQLite.table({
    name: "recipe_extract_jobs",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      url: State.SQLite.text({ nullable: false }),
      completedAt: State.SQLite.integer({
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
      list: State.SQLite.text({ nullable: true }),
      name: State.SQLite.text({ default: "" }),
      quantity: State.SQLite.text({ nullable: true }),
      aisle: State.SQLite.text({
        schema: GroceryAisle,
        nullable: true,
      }),
      recipeIds: State.SQLite.json({
        nullable: true,
        schema: Schema.NonEmptyArray(Schema.String),
      }),
      completed: State.SQLite.boolean({ default: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
    indexes: [
      {
        name: "grocery_items_list_idx",
        columns: ["list"],
      },
    ],
  }),
  ingredientAisles: State.SQLite.table({
    name: "ingredient_aisles",
    columns: {
      name: State.SQLite.text({ primaryKey: true }),
      aisle: State.SQLite.text({
        schema: GroceryAisle,
        nullable: false,
      }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
  }),
  menus: State.SQLite.table({
    name: "menus",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      name: State.SQLite.text({ nullable: false }),
      days: State.SQLite.integer({ nullable: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
  }),
  menuEntries: State.SQLite.table({
    name: "menu_entries",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      menuId: State.SQLite.text({ nullable: false }),
      day: State.SQLite.integer({ nullable: false }),
      recipeId: State.SQLite.text({ nullable: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromNumber,
      }),
    },
    indexes: [
      {
        name: "menu_entries_select_idx",
        columns: ["day", "menuId"],
      },
    ],
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
  keyValues: State.SQLite.table({
    name: "key_values",
    columns: {
      key: State.SQLite.text({ primaryKey: true }),
      value: State.SQLite.text({ nullable: false }),
    },
  }),
  aiMemoryEntries: State.SQLite.table({
    name: "ai_memory_entries",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      content: State.SQLite.text({ nullable: false }),
      createdAt: State.SQLite.integer({
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
  groceryListState: State.SQLite.clientDocument({
    name: "groceryListState",
    schema: Schema.Struct({
      currentList: Schema.NullOr(Schema.String),
    }),
    default: { id: "~/groceryListState", value: { currentList: null } },
  }),
}

// Events describe data changes (https://docs.livestore.dev/reference/events)
export const events = {
  recipeCreated: Events.synced({
    name: "v1.RecipeCreated",
    schema: Recipe.insert,
  }),
  recipeUpdated: Events.synced({
    name: "v1.RecipeUpdated",
    schema: Recipe.update,
  }),
  recipeSetIngredientScale: Events.synced({
    name: "v1.RecipeSetIngredientScale",
    schema: Schema.Struct({
      id: Schema.String,
      ingredientScale: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromNumber,
    }),
  }),
  recipeDeleted: Events.synced({
    name: "v1.RecipeDeleted",
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.DateTimeUtc }),
  }),
  recipeExtractJobAdded: Events.synced({
    name: "v1.RecipeExtractJobAdded",
    schema: Schema.Struct({
      id: Schema.String,
      url: Schema.String,
    }),
  }),
  recipeExtractJobCompleted: Events.synced({
    name: "v1.RecipeExtractJobCompleted",
    schema: Schema.Struct({
      id: Schema.String,
      completedAt: Schema.DateTimeUtc,
    }),
  }),
  recipeEditSet: Events.synced({
    name: "v1.RecipeEditSet",
    schema: RecipeEdit,
  }),
  recipeEditRemove: Events.synced({
    name: "v1.RecipeEditRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  mealPlanAdd: Events.synced({
    name: "v1.MealPlanAdd",
    schema: Schema.Struct({
      id: Schema.String,
      recipeId: Schema.String,
      day: Model.Date,
    }),
  }),
  mealPlanSetDay: Events.synced({
    name: "v1.MealPlanSetDay",
    schema: Schema.Struct({
      id: Schema.String,
      day: Model.Date,
    }),
  }),
  mealPlanRemove: Events.synced({
    name: "v1.MealPlanRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  groceryItemAdded: Events.synced({
    name: "v1.GroceryItemAdded",
    schema: GroceryItem.insert,
  }),
  groceryItemUpdated: Events.synced({
    name: "v1.GroceryItemUpdated",
    schema: GroceryItem.update,
  }),
  groceryItemCleared: Events.synced({
    name: "v1.GroceryItemCleared",
    schema: Schema.Union(
      Schema.Void,
      Schema.Struct({
        list: Schema.NullOr(Schema.String),
      }),
    ),
  }),
  groceryItemClearedCompleted: Events.synced({
    name: "v1.GroceryItemClearedCompleted",
    schema: Schema.Union(
      Schema.Void,
      Schema.Struct({
        list: Schema.NullOr(Schema.String),
      }),
    ),
  }),
  groceryItemDeleted: Events.synced({
    name: "v1.GroceryItemDeleted",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  groceryItemToggled: Events.synced({
    name: "v1.GroceryItemToggled",
    schema: Schema.Struct({ id: Schema.String, completed: Schema.Boolean }),
  }),
  menuAdd: Events.synced({
    name: "v1.MenuAdd",
    schema: Menu.insert,
  }),
  menuUpdate: Events.synced({
    name: "v1.MenuUpdate",
    schema: Menu.update,
  }),
  menuDayRemove: Events.synced({
    name: "v1.MenuDayRemove",
    schema: Schema.Struct({
      id: Schema.String,
      newDays: Schema.Number,
      day: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromNumber,
    }),
  }),
  menuRemove: Events.synced({
    name: "v1.MenuRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  menuEntryAdd: Events.synced({
    name: "v1.MenuEntryAdd",
    schema: MenuEntry.insert,
  }),
  menuEntrySetDay: Events.synced({
    name: "v1.MenuEntrySetDay",
    schema: Schema.Struct({
      id: Schema.String,
      day: Schema.Number,
      updatedAt: Schema.DateTimeUtc,
    }),
  }),
  menuEntryRemove: Events.synced({
    name: "v1.MenuEntryRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  settingsSet: Events.synced({
    name: "v1.SettingsSet",
    schema: Schema.Struct({
      id: Schema.String,
      value: Schema.Option(Schema.Unknown),
      updatedAt: Schema.DateTimeUtc,
    }),
  }),
  searchStateSet: tables.searchState.set,
  keyValueSet: Events.synced({
    name: "v1.KeyValueSet",
    schema: Schema.Struct({
      key: Schema.String,
      value: Schema.String,
    }),
  }),
  keyValueRemove: Events.synced({
    name: "v1.KeyValueRemove",
    schema: Schema.Struct({
      key: Schema.String,
    }),
  }),
  keyValueClear: Events.synced({
    name: "v1.KeyValueClear",
    schema: Schema.Void,
  }),
  aiMemoryEntryAdded: Events.synced({
    name: "v1.AIMemoryEntryAdded",
    schema: AiMemoryEntry.insert,
  }),
  aiMemoryEntryRemove: Events.synced({
    name: "v1.AIMemoryEntryRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  aiMemoryClear: Events.synced({
    name: "v1.AIMemoryClear",
    schema: Schema.Void,
  }),
}

// Materializers are used to map events to state (https://docs.livestore.dev/reference/state/materializers)
const materializers = State.SQLite.materializers(events, {
  "v1.RecipeCreated": (insert) =>
    tables.recipes.insert(insert).onConflict("id", "ignore"),
  "v1.RecipeUpdated": (update) =>
    tables.recipes.update(update).where({ id: update.id }),
  "v1.RecipeSetIngredientScale": ({ id, ingredientScale, updatedAt }) =>
    tables.recipes.update({ ingredientScale, updatedAt }).where({ id }),
  "v1.RecipeDeleted": ({ id, deletedAt }) =>
    tables.recipes.update({ deletedAt }).where({ id }),
  "v1.RecipeEditSet": (insert) =>
    tables.recipeEdits.insert(insert).onConflict("id", "update", insert),
  "v1.RecipeEditRemove": ({ id }) => tables.recipeEdits.delete().where({ id }),
  "v1.RecipeExtractJobAdded": (insert) =>
    tables.recipeExtractJobs.insert(insert).onConflict("id", "ignore"),
  "v1.RecipeExtractJobCompleted": ({ id, completedAt }) =>
    tables.recipeExtractJobs.update({ completedAt }).where({ id }),
  "v1.MealPlanAdd": (insert) => tables.mealPlan.insert(insert),
  "v1.MealPlanSetDay": ({ id, day }) =>
    tables.mealPlan.update({ day }).where({ id }),
  "v1.MealPlanRemove": ({ id }) => tables.mealPlan.delete().where({ id }),
  "v1.GroceryItemAdded": (insert) => {
    const add = tables.groceryItems.insert(insert).onConflict("id", "ignore")
    return insert.aisle
      ? [
          add,
          tables.ingredientAisles
            .insert({
              name: insert.name.toLowerCase().trim(),
              aisle: insert.aisle,
              createdAt: insert.createdAt,
              updatedAt: insert.updatedAt,
            })
            .onConflict("name", "update", {
              aisle: insert.aisle,
              updatedAt: insert.updatedAt,
            }),
        ]
      : add
  },
  "v1.GroceryItemUpdated": ({ id, ...update }) => {
    const add = tables.groceryItems.update(update).where({ id })
    const name = update.name.toLowerCase().trim()
    return [
      add,
      update.aisle
        ? tables.ingredientAisles
            .insert({
              name,
              aisle: update.aisle,
              createdAt: update.updatedAt,
              updatedAt: update.updatedAt,
            })
            .onConflict("name", "update", {
              aisle: update.aisle,
              updatedAt: update.updatedAt,
            })
        : tables.ingredientAisles.delete().where({ name }),
    ]
  },
  "v1.GroceryItemCleared": (input) => {
    const list = input ? input.list : null
    return tables.groceryItems.delete().where({ list })
  },
  "v1.GroceryItemClearedCompleted": (input) => {
    const list = input ? input.list : null
    return tables.groceryItems.delete().where({ completed: true, list })
  },
  "v1.GroceryItemDeleted": ({ id }) =>
    tables.groceryItems.delete().where({ id }),
  "v1.GroceryItemToggled": ({ completed, id }) =>
    tables.groceryItems.update({ completed }).where({ id }),
  "v1.MenuAdd": (insert) =>
    tables.menus.insert(insert).onConflict("id", "ignore"),
  "v1.MenuUpdate": ({ id, ...update }) =>
    tables.menus.update(update).where({ id }),
  "v1.MenuDayRemove": ({ id, newDays, day, updatedAt }) => [
    tables.menus.update({ days: newDays, updatedAt }).where({ id }),
    tables.menuEntries.delete().where({ menuId: id, day }),
  ],
  "v1.MenuRemove": ({ id }) => tables.menus.delete().where({ id }),
  "v1.MenuEntryAdd": (insert) =>
    tables.menuEntries.insert(insert).onConflict("id", "ignore"),
  "v1.MenuEntrySetDay": ({ id, ...update }) =>
    tables.menuEntries.update(update).where({ id }),
  "v1.MenuEntryRemove": ({ id }) => tables.menuEntries.delete().where({ id }),
  "v1.SettingsSet": ({ id, value, updatedAt }) => {
    const encoded = value.pipe(
      Option.map((v) => JSON.stringify(v)),
      Option.getOrNull,
    )
    return tables.settings
      .insert({
        id,
        value: encoded,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflict("id", "update", {
        value: encoded,
        updatedAt,
      })
  },
  "v1.KeyValueSet": ({ key, value }) =>
    tables.keyValues
      .insert({ key, value })
      .onConflict("key", "update", { value }),
  "v1.KeyValueRemove": ({ key }) => tables.keyValues.delete().where({ key }),
  "v1.KeyValueClear": () => tables.keyValues.delete(),
  "v1.AIMemoryEntryAdded": (insert) => tables.aiMemoryEntries.insert(insert),
  "v1.AIMemoryEntryRemove": ({ id }) =>
    tables.aiMemoryEntries.delete().where({ id }),
  "v1.AIMemoryClear": () => tables.aiMemoryEntries.delete(),
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
