import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import type { RecipeId } from "./domain/Recipe"
import { QueryBuilder } from "./IndexedDb"
import { eventFields } from "./lib/eventFields"
import { applyLww, lwwRemove, lwwSet, stampAll } from "./lib/Lww"
import { RecipeEvents } from "./Recipes/Events"
import type { RecipeRow } from "./Recipes/Table"

// Handlers converge whatever order remote entries arrive in: a
// create inserts only when the row is missing, updates patch fields under
// last-writer-wins and do nothing when the row is missing, and recipe edits
// keep tombstones because their key is the recipe id.

const { events } = RecipeEvents
const createdFields = eventFields(events.RecipeCreated.payload)
const updatedFields = eventFields(events.RecipeUpdated.payload)
const scaleFields = eventFields(events.RecipeSetIngredientScale.payload)
const deletedFields = eventFields(events.RecipeDeleted.payload)
const editFields = eventFields(events.RecipeEditSet.payload)

const RecipesHandlers = EventLog.group(RecipeEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const recipes = db.from("recipes")
    const recipeEdits = db.from("recipeEdits")

    const recipeRow = (id: RecipeId) =>
      recipes
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => rows[0]))
    const editRow = (id: RecipeId) =>
      recipeEdits
        .select()
        .equals(id)
        .limit(1)
        .pipe(Effect.map((rows) => Option.fromUndefinedOr(rows[0])))

    const patchRecipe = Effect.fnUntraced(function* (
      id: RecipeId,
      patch: Partial<Omit<RecipeRow, "_lww">>,
      entry: EventJournal.Entry,
    ) {
      const row = yield* recipeRow(id)
      if (row === undefined) return
      const next = applyLww(row, patch, entry)
      if (next !== row) yield* recipes.upsert(next)
    })

    return handlers
      .handle("RecipeCreated", ({ payload, entry }) =>
        Effect.gen(function* () {
          if ((yield* recipeRow(payload.id)) !== undefined) return
          yield* recipes.insert(
            stampAll({ ...createdFields(payload), ingredientScale: 1 }, entry),
          )
        }).pipe(Effect.orDie),
      )
      .handle("RecipeUpdated", ({ payload, entry }) =>
        patchRecipe(payload.id, updatedFields(payload), entry).pipe(
          Effect.orDie,
        ),
      )
      .handle("RecipeSetIngredientScale", ({ payload, entry }) =>
        patchRecipe(payload.id, scaleFields(payload), entry).pipe(Effect.orDie),
      )
      .handle("RecipeDeleted", ({ payload, entry }) =>
        patchRecipe(payload.id, deletedFields(payload), entry).pipe(
          Effect.orDie,
        ),
      )
      .handle("RecipeEditSet", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* editRow(payload.id)
          yield* recipeEdits.upsert(
            lwwSet(Option.getOrUndefined(row), editFields(payload), entry),
          )
        }).pipe(Effect.orDie),
      )
      .handle("RecipeEditRemove", ({ payload, entry }) =>
        Effect.gen(function* () {
          const row = yield* editRow(payload.id)
          yield* recipeEdits.upsert(
            lwwRemove(
              Option.getOrUndefined(row),
              {
                id: payload.id,
                title: "",
                imageUrl: null,
                prepTime: null,
                cookingTime: null,
                servings: null,
                ingredients: [],
                steps: [],
                sourceName: null,
              },
              entry,
            ),
          )
        }).pipe(Effect.orDie),
      )
  }),
)

const RecipesReactivity = EventLog.groupReactivity(RecipeEvents, {
  RecipeCreated: ["recipes"],
  RecipeUpdated: ["recipes"],
  RecipeSetIngredientScale: ["recipes"],
  RecipeDeleted: ["recipes"],
  RecipeEditSet: ["recipeEdits"],
  RecipeEditRemove: ["recipeEdits"],
})

export const RecipesLayer = Layer.mergeAll(RecipesHandlers, RecipesReactivity)
