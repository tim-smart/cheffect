import type * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"
import { Recipe, RecipeEdit, type RecipeId } from "@/domain/Recipe"
import { patchFields } from "@/lib/eventFields"
import { uuidKey, uuidString } from "@/lib/Id"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed. `Unit` in the ingredients is a literal union: adding a unit
// needs every client updated first.
//
// Recipes are never removed: a delete patches `deletedAt`, so a recipe stays
// for the menus, meal plans and groceries that point at it, and a late
// update can't bring it back as live. A recipe edit is keyed by its recipe's
// id and removed when it's saved or discarded.
export const RecipeEvent = EventRow.make("Recipe", {
  key: uuidKey,
  schema: Schema.Struct(Recipe.fields),
})

export const RecipeEditEvent = EventRow.make("RecipeEdit", {
  key: uuidKey,
  schema: RecipeEdit,
})

export const RecipeEvents = EventGroup.empty
  .add(RecipeEvent)
  .add(RecipeEditEvent)

const updateFields = patchFields(Recipe.update)

// Every field a recipe update writes, from a value that may carry more.
export const recipeUpdate = (recipe: typeof Recipe.update.Type) =>
  RecipeEvent.patch(uuidString(recipe.id), updateFields(recipe))

// Only the scale, so a concurrent edit to the recipe isn't undone.
export const recipeIngredientScale = (
  id: RecipeId,
  ingredientScale: number,
  updatedAt: DateTime.Utc,
) => RecipeEvent.patch(uuidString(id), { ingredientScale, updatedAt })

export const recipeDeleted = (id: RecipeId, deletedAt: DateTime.Utc) =>
  RecipeEvent.patch(uuidString(id), { deletedAt })
