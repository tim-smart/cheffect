import { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { GroceryAisle } from "../domain/GroceryItem"
import { Rating } from "../domain/Rating"
import {
  DurationField,
  ExtractedRecipe,
  IngredientsComponent,
  SortByValue,
  Step,
} from "../domain/Recipe"
import * as Model from "effect/schema/Model"
import { Events, makeSchema, State } from "@livestore/livestore"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

// The timer events as LiveStore wrote them, with string ids. Frozen here now
// that the domain `Timer` lives on EventLog, so old event logs still decode.
class LegacyTimer extends Model.Class<LegacyTimer>("LegacyTimer")({
  id: Model.GeneratedByApp(Schema.String),
  label: Schema.String,
  duration: Schema.DurationFromMillis,
  expiresAt: Schema.DateTimeUtcFromMillis,
  pausedRemaining: Schema.NullOr(Schema.DurationFromMillis),
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {}

// The meal plan day note events as LiveStore wrote them, with string ids.
// Frozen here now that the domain `MealPlanDayNote` lives on EventLog, so old
// event logs and exports still decode.
export class LegacyMealPlanDayNote extends Model.Class<LegacyMealPlanDayNote>(
  "LegacyMealPlanDayNote",
)({
  id: Model.GeneratedByApp(Schema.String),
  day: Model.Date,
  note: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {}

// The menu events as LiveStore wrote them, with string ids. Frozen here now
// that the domain menu models live on EventLog, so old event logs and exports
// still decode.
export class LegacyMenu extends Model.Class<LegacyMenu>("LegacyMenu")({
  id: Model.GeneratedByApp(Schema.String),
  name: Schema.String,
  days: Schema.Number,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(Model.FieldExcept(["update"])),
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class LegacyMenuEntry extends Model.Class<LegacyMenuEntry>(
  "LegacyMenuEntry",
)({
  id: Model.GeneratedByApp(Schema.String),
  menuId: Model.Field({
    insert: Schema.String,
  }),
  recipeId: Model.Field({
    insert: Schema.String,
  }),
  day: Schema.Number,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {}

export class LegacyMenuDayNote extends Model.Class<LegacyMenuDayNote>(
  "LegacyMenuDayNote",
)({
  id: Model.GeneratedByApp(Schema.String),
  menuId: Model.Field({
    insert: Schema.String,
  }),
  day: Schema.Number,
  note: Schema.String,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {}

// The grocery item events as LiveStore wrote them: string ids, recipe ids as
// strings, and `completed` as a bit. Frozen here now that the domain
// `GroceryItem` lives on EventLog, so old event logs and exports still decode.
export class LegacyGroceryItem extends Model.Class<LegacyGroceryItem>(
  "LegacyGroceryItem",
)({
  id: Model.GeneratedByApp(Schema.String),
  list: Schema.NullOr(Schema.String).pipe(
    Model.FieldExcept(["update", "jsonUpdate"]),
    Model.fieldEvolve({
      insert: (s) => Schema.optional(s),
    }),
  ),
  name: Schema.String,
  quantity: Schema.NullOr(Schema.String),
  aisle: Schema.NullOr(GroceryAisle),
  recipeIds: Model.fieldEvolve(
    Schema.NullOr(Schema.NonEmptyArray(Schema.String)),
    {
      select: () =>
        Schema.NullOr(
          Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
        ),
    },
  ),
  completed: Schema.BooleanFromBit,
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {
  static array = Schema.Array(LegacyGroceryItem)
}

// The recipe events as LiveStore wrote them: string ids, and ingredients and
// steps as JSON strings. Frozen here now that the domain `Recipe` lives on
// EventLog, so old event logs and exports still decode.
export class LegacyRecipe extends Model.Class<LegacyRecipe>("LegacyRecipe")({
  ...ExtractedRecipe.fields,
  id: Model.GeneratedByApp(Schema.String),
  cookingTime: DurationField,
  prepTime: DurationField,
  ingredients: Model.JsonFromString(IngredientsComponent.array),
  ingredientScale: Model.Field({
    select: Schema.Number,
    update: Schema.Number,
  }),
  steps: Model.JsonFromString(Schema.Array(Step)),
  rating: Schema.NullOr(Rating),
  sourceUrl: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldOnly(["insert", "select", "json"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldOnly(["insert", "update", "select", "json"]),
  ),
  deletedAt: Model.GeneratedByApp(Schema.NullOr(Schema.DateTimeUtcFromMillis)),
}) {}

const LegacyRecipeEdit = Schema.Struct({
  id: LegacyRecipe.fields.id,
  title: LegacyRecipe.fields.title,
  imageUrl: LegacyRecipe.fields.imageUrl,
  prepTime: LegacyRecipe.fields.prepTime,
  cookingTime: LegacyRecipe.fields.cookingTime,
  servings: LegacyRecipe.fields.servings,
  ingredients: LegacyRecipe.fields.ingredients,
  steps: LegacyRecipe.fields.steps,
  sourceName: LegacyRecipe.fields.sourceName,
})

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
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
    indexes: [
      {
        name: "recipes_deleted_at_title_idx",
        columns: ["deletedAt", "title"],
      },
      {
        name: "recipes_deleted_at_ingredients_idx",
        columns: ["deletedAt", "ingredients"],
      },
    ],
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
        schema: Schema.DateTimeUtcFromMillis,
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
        schema: Schema.DateTimeUtcFromMillis,
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
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
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
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
  }),
  groceryAisleOrders: State.SQLite.table({
    name: "grocery_aisle_orders",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      list: State.SQLite.text({ nullable: true }),
      aisle: State.SQLite.text({ nullable: false }),
      sortOrder: State.SQLite.integer({ nullable: false }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
    indexes: [
      {
        name: "grocery_aisle_orders_list_idx",
        columns: ["list"],
      },
    ],
  }),
  menus: State.SQLite.table({
    name: "menus",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      name: State.SQLite.text({ nullable: false }),
      days: State.SQLite.integer({ nullable: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
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
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
    indexes: [
      {
        name: "menu_entries_select_idx",
        columns: ["day", "menuId"],
      },
    ],
  }),
  menuDayNotes: State.SQLite.table({
    name: "menu_day_notes",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      menuId: State.SQLite.text({ nullable: false }),
      day: State.SQLite.integer({ nullable: false }),
      note: State.SQLite.text({ nullable: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
    indexes: [
      {
        name: "menu_day_notes_menu_idx",
        columns: ["menuId", "day"],
      },
    ],
  }),
  mealPlanDayNotes: State.SQLite.table({
    name: "meal_plan_day_notes",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      day: State.SQLite.text({
        nullable: false,
        schema: Model.Date,
      }),
      note: State.SQLite.text({ nullable: false }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
    indexes: [
      {
        name: "meal_plan_day_notes_day_idx",
        columns: ["day"],
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
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
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
        schema: Schema.DateTimeUtcFromMillis,
      }),
    },
  }),
  timers: State.SQLite.table({
    name: "timers",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      label: State.SQLite.text({ nullable: false }),
      duration: State.SQLite.integer({
        schema: Schema.DurationFromMillis,
      }),
      expiresAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
      pausedRemaining: State.SQLite.integer({
        nullable: true,
        schema: Schema.DurationFromMillis,
      }),
      createdAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
      }),
      updatedAt: State.SQLite.integer({
        schema: Schema.DateTimeUtcFromMillis,
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
    schema: LegacyRecipe.insert,
  }),
  recipeUpdated: Events.synced({
    name: "v1.RecipeUpdated",
    schema: LegacyRecipe.update,
  }),
  recipeSetIngredientScale: Events.synced({
    name: "v1.RecipeSetIngredientScale",
    schema: Schema.Struct({
      id: Schema.String,
      ingredientScale: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromMillis,
    }),
  }),
  recipeDeleted: Events.synced({
    name: "v1.RecipeDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.DateTimeUtcFromString,
    }),
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
      completedAt: Schema.DateTimeUtcFromString,
    }),
  }),
  recipeEditSet: Events.synced({
    name: "v1.RecipeEditSet",
    schema: LegacyRecipeEdit,
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
    schema: LegacyGroceryItem.insert,
  }),
  groceryItemUpdated: Events.synced({
    name: "v1.GroceryItemUpdated",
    schema: Schema.Struct({
      ...LegacyGroceryItem.update.fields,
      previousName: Schema.optional(Schema.String),
      userInitiated: Schema.optional(Schema.Boolean),
    }),
  }),
  ingredientAisleRemoved: Events.synced({
    name: "v1.IngredientAisleRemoved",
    schema: Schema.Struct({
      name: Schema.String,
    }),
  }),
  groceryAisleOrderSet: Events.synced({
    name: "v1.GroceryAisleOrderSet",
    schema: Schema.Struct({
      id: Schema.String,
      list: Schema.NullOr(Schema.String),
      aisle: Schema.String,
      sortOrder: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromMillis,
    }),
  }),
  groceryItemCleared: Events.synced({
    name: "v1.GroceryItemCleared",
    schema: Schema.Union([
      Schema.Struct({
        list: Schema.NullOr(Schema.String),
      }),
      Schema.Void,
    ]),
  }),
  groceryItemClearedCompleted: Events.synced({
    name: "v1.GroceryItemClearedCompleted",
    schema: Schema.Union([
      Schema.Struct({
        list: Schema.NullOr(Schema.String),
      }),
      Schema.Void,
    ]),
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
    schema: LegacyMenu.insert,
  }),
  menuUpdate: Events.synced({
    name: "v1.MenuUpdate",
    schema: LegacyMenu.update,
  }),
  menuDayRemove: Events.synced({
    name: "v1.MenuDayRemove",
    schema: Schema.Struct({
      id: Schema.String,
      newDays: Schema.Number,
      day: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromMillis,
    }),
  }),
  menuRemove: Events.synced({
    name: "v1.MenuRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  menuEntryAdd: Events.synced({
    name: "v1.MenuEntryAdd",
    schema: LegacyMenuEntry.insert,
  }),
  menuEntrySetDay: Events.synced({
    name: "v1.MenuEntrySetDay",
    schema: Schema.Struct({
      id: Schema.String,
      day: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromString,
    }),
  }),
  menuEntryRemove: Events.synced({
    name: "v1.MenuEntryRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  menuDayNoteAdd: Events.synced({
    name: "v1.MenuDayNoteAdd",
    schema: LegacyMenuDayNote.insert,
  }),
  menuDayNoteUpdate: Events.synced({
    name: "v1.MenuDayNoteUpdate",
    schema: LegacyMenuDayNote.update,
  }),
  menuDayNoteRemove: Events.synced({
    name: "v1.MenuDayNoteRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  mealPlanDayNoteAdd: Events.synced({
    name: "v1.MealPlanDayNoteAdd",
    schema: LegacyMealPlanDayNote.insert,
  }),
  mealPlanDayNoteUpdate: Events.synced({
    name: "v1.MealPlanDayNoteUpdate",
    schema: LegacyMealPlanDayNote.update,
  }),
  mealPlanDayNoteRemove: Events.synced({
    name: "v1.MealPlanDayNoteRemove",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  settingsSet: Events.synced({
    name: "v1.SettingsSet",
    schema: Schema.Struct({
      id: Schema.String,
      value: Schema.toCodecJson(Schema.Option(Schema.Unknown)),
      updatedAt: Schema.DateTimeUtcFromString,
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
  timerAdded: Events.synced({
    name: "v1.TimerAdded",
    schema: LegacyTimer.insert,
  }),
  timerUpdate: Events.synced({
    name: "v1.TimerUpdated",
    schema: LegacyTimer.update,
  }),
  timerDeleted: Events.synced({
    name: "v1.TimerDeleted",
    schema: Schema.Struct({ id: Schema.String }),
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
            .onConflict("name", "ignore"),
        ]
      : add
  },
  "v1.GroceryItemUpdated": ({ id, previousName, userInitiated, ...update }) => {
    const add = tables.groceryItems.update(update).where({ id })
    const name = update.name.toLowerCase().trim()
    previousName = previousName?.toLowerCase().trim()
    const aisleInsert = tables.ingredientAisles.insert({
      name,
      aisle: update.aisle!,
      createdAt: update.updatedAt,
      updatedAt: update.updatedAt,
    })
    return [
      add,
      update.aisle
        ? userInitiated
          ? aisleInsert.onConflict("name", "update", {
              aisle: update.aisle,
              updatedAt: update.updatedAt,
            })
          : aisleInsert.onConflict("name", "ignore")
        : tables.ingredientAisles.delete().where({ name }),
      ...(update.aisle && previousName && previousName !== name
        ? [tables.ingredientAisles.delete().where({ name: previousName })]
        : []),
    ]
  },
  "v1.IngredientAisleRemoved": ({ name }) =>
    tables.ingredientAisles.delete().where({ name }),
  "v1.GroceryAisleOrderSet": (insert) =>
    tables.groceryAisleOrders.insert(insert).onConflict("id", "update", {
      sortOrder: insert.sortOrder,
      updatedAt: insert.updatedAt,
    }),
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
    tables.menuDayNotes.delete().where({ menuId: id, day }),
  ],
  "v1.MenuRemove": ({ id }) => tables.menus.delete().where({ id }),
  "v1.MenuEntryAdd": (insert) =>
    tables.menuEntries.insert(insert).onConflict("id", "ignore"),
  "v1.MenuEntrySetDay": ({ id, ...update }) =>
    tables.menuEntries.update(update).where({ id }),
  "v1.MenuEntryRemove": ({ id }) => tables.menuEntries.delete().where({ id }),
  "v1.MenuDayNoteAdd": (insert) =>
    tables.menuDayNotes.insert(insert).onConflict("id", "update", insert),
  "v1.MenuDayNoteUpdate": ({ id, ...update }) =>
    tables.menuDayNotes.update(update).where({ id }),
  "v1.MenuDayNoteRemove": ({ id }) =>
    tables.menuDayNotes.delete().where({ id }),
  "v1.MealPlanDayNoteAdd": (insert) =>
    tables.mealPlanDayNotes.insert(insert).onConflict("id", "update", insert),
  "v1.MealPlanDayNoteUpdate": ({ id, ...update }) =>
    tables.mealPlanDayNotes.update(update).where({ id }),
  "v1.MealPlanDayNoteRemove": ({ id }) =>
    tables.mealPlanDayNotes.delete().where({ id }),
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
  "v1.TimerAdded": (insert) => tables.timers.insert(insert),
  "v1.TimerUpdated": ({ id, ...update }) =>
    tables.timers.update(update).where({ id }),
  "v1.TimerDeleted": ({ id }) => tables.timers.delete().where({ id }),
})

const state = State.SQLite.makeState({ tables, materializers })

export const schema = makeSchema({ events, state })

// ----

// ensure LegacyRecipe model is assignable to the recipes table
tables.recipes.rowSchema.pipe(
  Schema.decodeTo(
    Schema.toType(LegacyRecipe),
    SchemaTransformation.transform({
      decode: (row) =>
        new LegacyRecipe({
          ...row,
          rating: row.rating != null ? Rating.make(row.rating) : null,
        }),
      encode: (recipe) => recipe,
    }),
  ),
)

// ensure LegacyGroceryItem model is assignable to the table
tables.groceryItems.rowSchema.pipe(
  Schema.decodeTo(
    Schema.toType(LegacyGroceryItem),
    SchemaTransformation.transform({
      decode: (row) => new LegacyGroceryItem(row),
      encode: (item) => item,
    }),
  ),
)
