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
import { RecipesLayer } from "@/Recipes"
import { RecipeEvents } from "@/Recipes/Events"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeIdFromString,
  Step,
} from "@/domain/Recipe"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Recipes handlers converge whatever order remote entries arrive in:
// fields merge under last-writer-wins on entry time, and soft delete is just
// the `deletedAt` field under the same rule.
//
// A `RecipeCreated` is delivered before the permuted entries, not among them.
// An update does nothing when the row is missing (TIM-248 rule 3), and nothing
// can edit a recipe its device hasn't received, so the server sequence always
// puts the create first.

const {
  RecipeCreated,
  RecipeUpdated,
  RecipeSetIngredientScale,
  RecipeDeleted,
} = RecipeEvents.events

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)

const at = (msecs: number) => DateTime.makeUnsafe(msecs)

const soup = {
  title: "Soup",
  imageUrl: null,
  prepTime: Duration.minutes(10),
  cookingTime: Duration.minutes(30),
  servings: 4,
  ingredients: [
    new IngredientsComponent({
      name: "Soup",
      ingredients: [
        new Ingredient({ name: "Carrot", quantity: 2, unit: null }),
        new Ingredient({ name: "Stock", quantity: 1, unit: "l" }),
      ],
    }),
  ],
  steps: [new Step({ text: "Simmer until soft.", tips: [] })],
  sourceName: null,
}

const created = makeEntry({
  msecs: 1000,
  event: RecipeCreated,
  payload: Recipe.insert.make({
    ...soup,
    id: recipeId,
    rating: null,
    sourceUrl: null,
    createdAt: at(1000),
    updatedAt: at(1000),
    deletedAt: null,
  }),
})

// A whole-form save, as the edit route writes it.
const updated = (
  msecs: number,
  fields: Partial<typeof Recipe.update.Type> = {},
) =>
  makeEntry({
    msecs,
    event: RecipeUpdated,
    payload: Recipe.update.make({
      ...soup,
      id: recipeId,
      rating: null,
      sourceUrl: null,
      ingredientScale: 1,
      updatedAt: at(msecs),
      deletedAt: null,
      ...fields,
    }),
  })

const scaled = (msecs: number, ingredientScale: number) =>
  makeEntry({
    msecs,
    event: RecipeSetIngredientScale,
    payload: { id: recipeId, ingredientScale, updatedAt: at(msecs) },
  })

const deleted = (msecs: number) =>
  makeEntry({
    msecs,
    event: RecipeDeleted,
    payload: { id: recipeId, deletedAt: at(msecs) },
  })

const makeLayer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(RecipeEvents),
    RecipesLayer,
  ).pipe(
    Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
  )
  return Layer.mergeAll(eventLog, remote.pipe(Layer.provide(eventLog))).pipe(
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
}

const read = Effect.map(readTable("recipes"), (recipes) => ({ recipes }))

test("a local whole-Recipe update preserves createdAt", async () => {
  const identity = await Effect.runPromise(testIdentity)
  const { recipes } = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* remote.deliver([created])
      const log = yield* EventLog.EventLog
      // The edit form supplies a whole Recipe, including a new createdAt.
      yield* log.write({
        schema: EventLog.schema(RecipeEvents),
        event: "RecipeUpdated",
        payload: new Recipe({
          ...soup,
          id: recipeId,
          title: "Carrot soup",
          rating: null,
          sourceUrl: null,
          ingredientScale: 2,
          createdAt: at(2000),
          updatedAt: at(2000),
          deletedAt: null,
        }),
      })
      return yield* read
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.provide(makeLayer(identity, remote.layer)),
    )
  }).pipe(Effect.runPromise)
  assert.deepEqual(
    pick(only(recipes), ["title", "ingredientScale", "createdAt", "updatedAt"]),
    {
      title: "Carrot soup",
      ingredientScale: 2,
      createdAt: 1000,
      updatedAt: 2000,
    },
  )
})

test("on the same recipe field the newest entry wins, not the newest updatedAt", async () => {
  const { recipes } = await converge({
    layer: makeLayer,
    read,
    setup: [created],
    concurrent: [
      // A device with its clock ahead: its updatedAt is not what decides.
      updated(2000, { title: "Carrot soup", updatedAt: at(9000) }),
      scaled(2500, 3),
      // A whole-form save stamps every field, ingredientScale included.
      updated(3000, { title: "Leek soup" }),
    ],
  })
  assert.deepEqual(
    pick(only(recipes), ["title", "ingredientScale", "updatedAt"]),
    { title: "Leek soup", ingredientScale: 1, updatedAt: 3000 },
  )
})

test("a recipe delete newer than an edit keeps the recipe deleted, with the edit applied", async () => {
  const { recipes } = await converge({
    layer: makeLayer,
    read,
    setup: [created],
    concurrent: [updated(2000, { title: "Carrot soup" }), deleted(3000)],
  })
  assert.deepEqual(pick(only(recipes), ["title", "deletedAt"]), {
    title: "Carrot soup",
    deletedAt: 3000,
  })
})
