import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MealPlanLayer } from "@/MealPlan"
import { MealPlanEntryEvent, MealPlanEvents } from "@/MealPlan/Events"
import { MealPlanRepo } from "@/MealPlan/Repo"
import { RecipesLayer } from "@/Recipes"
import { RecipeEvent, RecipeEvents, recipeDeleted } from "@/Recipes/Events"
import { RecipeRepo } from "@/Recipes/Repo"
import { MealPlanEntryIdFromString } from "@/domain/MealPlanEntry"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeIdFromString,
  Step,
} from "@/domain/Recipe"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// The meal plan joins its entries with the recipes snapshot: an
// entry whose recipe is missing (not synced yet, or never) is hidden, and one
// whose recipe is soft-deleted still shows.

const schema = EventLog.schema(RecipeEvents, MealPlanEvents)

const layer = MealPlanRepo.layer.pipe(
  Layer.provideMerge(RecipeRepo.layer),
  Layer.provideMerge(
    EventLog.layer(schema, Layer.mergeAll(RecipesLayer, MealPlanLayer)).pipe(
      Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
      Layer.provide(Layer.effect(EventLog.Identity, testIdentity)),
    ),
  ),
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(layerFreshIndexedDb),
)

const recipeId = Schema.decodeSync(RecipeIdFromString)
const entryId = Schema.decodeSync(MealPlanEntryIdFromString)

const soup = recipeId("0193c7a0-1b2c-4def-8123-456789abcde1")
const pie = recipeId("0193c7a0-1b2c-4def-8123-456789abcde2")
const neverSynced = recipeId("0193c7a0-1b2c-4def-8123-456789abcde3")

const day = (iso: string) => DateTime.makeUnsafe(iso)
const monday = day("2025-10-13")

const recipe = (id: typeof soup, title: string) =>
  Recipe.make({
    id,
    title,
    ingredientScale: 1,
    imageUrl: null,
    prepTime: Duration.minutes(10),
    cookingTime: Duration.minutes(30),
    servings: 4,
    ingredients: [
      new IngredientsComponent({
        name: title,
        ingredients: [
          new Ingredient({ name: "Salt", quantity: null, unit: null }),
        ],
      }),
    ],
    steps: [new Step({ text: "Cook.", tips: [] })],
    sourceName: null,
    rating: null,
    sourceUrl: null,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
    deletedAt: null,
  })

test("the week's entries hide a missing recipe and keep a soft-deleted one", async () => {
  const week = await Effect.gen(function* () {
    const log = yield* EventLog.EventLog
    yield* log.write({
      schema,
      event: RecipeEvent.tag,
      payload: RecipeEvent.set(recipe(soup, "Soup")),
    })
    yield* log.write({
      schema,
      event: RecipeEvent.tag,
      payload: RecipeEvent.set(recipe(pie, "Pie")),
    })
    yield* log.write({
      schema,
      event: RecipeEvent.tag,
      payload: recipeDeleted(pie, DateTime.makeUnsafe(2000)),
    })
    const plan = [
      ["0193c7a0-1b2c-4def-8123-0123456789a1", soup, "2025-10-14"],
      ["0193c7a0-1b2c-4def-8123-0123456789a2", pie, "2025-10-13"],
      ["0193c7a0-1b2c-4def-8123-0123456789a3", neverSynced, "2025-10-15"],
      // Next week's, outside the range.
      ["0193c7a0-1b2c-4def-8123-0123456789a4", soup, "2025-10-20"],
    ] as const
    for (const [id, recipeId, onDay] of plan) {
      yield* log.write({
        schema,
        event: MealPlanEntryEvent.tag,
        payload: MealPlanEntryEvent.set({
          id: entryId(id),
          recipeId,
          day: day(onDay),
        }),
      })
    }
    const repo = yield* MealPlanRepo
    return yield* repo.week(monday)
  }).pipe(Effect.timeout("5 seconds"), Effect.provide(layer), Effect.runPromise)

  assert.deepEqual(
    week.entries.map((entry) => ({
      id: entry.idString,
      day: DateTime.formatIsoDate(entry.day),
      title: entry.recipe.title,
      deleted: entry.recipe.deletedAt !== null,
    })),
    [
      {
        id: "0193c7a0-1b2c-4def-8123-0123456789a2",
        day: "2025-10-13",
        title: "Pie",
        deleted: true,
      },
      {
        id: "0193c7a0-1b2c-4def-8123-0123456789a1",
        day: "2025-10-14",
        title: "Soup",
        deleted: false,
      },
    ],
  )
})
