import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import { Recipe, RecipeEdit, RecipeId } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays.
export const RecipeEvents = EventGroup.empty
  .add({
    tag: "RecipeCreated",
    primaryKey: (recipe) => uuidString(recipe.id),
    payload: Recipe.insert,
  })
  .add({
    tag: "RecipeUpdated",
    primaryKey: (recipe) => uuidString(recipe.id),
    payload: Recipe.update,
  })
  .add({
    tag: "RecipeSetIngredientScale",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({
      id: RecipeId,
      ingredientScale: Schema.Number,
      updatedAt: Schema.DateTimeUtcFromMillis,
    }),
  })
  .add({
    tag: "RecipeDeleted",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({
      id: RecipeId,
      deletedAt: Schema.DateTimeUtcFromMillis,
    }),
  })
  .add({
    tag: "RecipeEditSet",
    primaryKey: ({ id }) => uuidString(id),
    payload: RecipeEdit,
  })
  .add({
    tag: "RecipeEditRemove",
    primaryKey: ({ id }) => uuidString(id),
    payload: Schema.Struct({ id: RecipeId }),
  })
