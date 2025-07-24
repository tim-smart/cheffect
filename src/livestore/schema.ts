import { IngredientsComponent, Recipe, Step } from "@/domain/Recipe"
import { Events, makeSchema, Schema, State } from "@livestore/livestore"

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
        schema: Schema.DateFromNumber,
      }),
    },
  }),
  // Client documents can be used for local-only state (e.g. form inputs)
  searchState: State.SQLite.clientDocument({
    name: "searchState",
    schema: Schema.Struct({
      query: Schema.String,
    }),
    default: { id: "~/searchState", value: { query: "" } },
  }),
}

export const RecipeFromSqlite = Schema.transform(
  tables.recipes.rowSchema,
  Schema.typeSchema(Recipe),
  {
    strict: true,
    decode: (row) => new Recipe(row),
    encode: (recipe) => ({
      ...recipe,
      deletedAt: null,
    }),
  },
)

// Events describe data changes (https://docs.livestore.dev/reference/events)
export const events = {
  recipeCreated: Events.synced({
    name: "v1.RecipeCreated",
    schema: Recipe.insert,
  }),
  recipeDeleted: Events.synced({
    name: "v1.RecipeDeleted",
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.DateTimeUtc }),
  }),
  searchStateSet: tables.searchState.set,
}

// Materializers are used to map events to state (https://docs.livestore.dev/reference/state/materializers)
const materializers = State.SQLite.materializers(events, {
  "v1.RecipeCreated": (insert) => tables.recipes.insert(insert),
  "v1.RecipeDeleted": ({ id, deletedAt }) =>
    tables.recipes.update({ deletedAt }).where({ id }),
})

const state = State.SQLite.makeState({ tables, materializers })

export const schema = makeSchema({ events, state })
