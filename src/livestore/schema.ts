import { Events, makeSchema, Schema, State } from "@livestore/livestore"

// You can model your state as SQLite tables (https://docs.livestore.dev/reference/state/sqlite-schema)
export const tables = {
  recipes: State.SQLite.table({
    name: "recipes",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      title: State.SQLite.text({ default: "" }),
      cookTime: State.SQLite.text({ nullable: true }),
      rating: State.SQLite.real({ nullable: true }),
      servings: State.SQLite.integer({ nullable: true }),
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
  // // Client documents can be used for local-only state (e.g. form inputs)
  // uiState: State.SQLite.clientDocument({
  //   name: "uiState",
  //   schema: Schema.Struct({
  //     newTodoText: Schema.String,
  //     filter: Schema.Literal("all", "active", "completed"),
  //   }),
  //   default: { id: SessionIdSymbol, value: { newTodoText: "", filter: "all" } },
  // }),
}

// Events describe data changes (https://docs.livestore.dev/reference/events)
export const events = {
  recipeCreated: Events.synced({
    name: "v1.RecipeCreated",
    schema: Schema.Struct({
      id: Schema.String,
      title: Schema.NonEmptyTrimmedString,
      cookTime: Schema.optional(Schema.String),
      rating: Schema.optional(Schema.Number),
      servings: Schema.optional(Schema.Number),
    }),
  }),
  // recipeUpdated: Events.synced({
  //   name: "v1.RecipeUpdated",
  //   schema: Schema.Struct({ id: Schema.String }),
  // }),
  recipeDeleted: Events.synced({
    name: "v1.RecipeDeleted",
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.DateTimeUtc }),
  }),
}

// Materializers are used to map events to state (https://docs.livestore.dev/reference/state/materializers)
const materializers = State.SQLite.materializers(events, {
  "v1.RecipeCreated": ({ id, title, cookTime, rating, servings }) =>
    tables.recipes.insert({ id, title, cookTime, rating, servings }),
  "v1.RecipeDeleted": ({ id, deletedAt }) =>
    tables.recipes.update({ deletedAt }).where({ id }),
})

const state = State.SQLite.makeState({ tables, materializers })

export const schema = makeSchema({ events, state })
