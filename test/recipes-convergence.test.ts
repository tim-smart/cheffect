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
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import { CheffectEvents } from "@/EventLog"
import { QueryBuilder, databaseName, layerDatabase } from "@/IndexedDb"
import { RecipesLayer } from "@/Recipes"
import { RecipeEvents } from "@/Recipes/Events"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeEdit,
  RecipeIdFromString,
  Step,
} from "@/domain/Recipe"
import { layerFreshIndexedDb, readRecords } from "./harness/indexeddb"
import { makeEntry, makeFakeRemote, testIdentity } from "./harness/eventlog"
import { everyOrder } from "./harness/orders"

// The Recipes handlers converge whatever order remote entries arrive in: each
// scenario runs on a fresh database once per ordering, every ordering must
// leave the same rows on disk (ignoring `_lww`), and that state must be the
// expected one. Real tables and handlers, entries through a fake remote.
//
// A `RecipeCreated` is delivered before the permuted entries, not among them.
// An update does nothing when the row is missing (TIM-248 rule 3), and nothing
// can edit a recipe its device hasn't received, so the server sequence always
// puts the create first. Recipe edits are upserts and have no such setup.

const {
  RecipeCreated,
  RecipeUpdated,
  RecipeSetIngredientScale,
  RecipeDeleted,
  RecipeEditSet,
  RecipeEditRemove,
} = RecipeEvents.events

const recipeIdString = "0193c7a0-1b2c-4def-8123-456789abcdef"
const recipeId = Schema.decodeSync(RecipeIdFromString)(recipeIdString)

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

const editSet = (msecs: number, title: string) =>
  makeEntry({
    msecs,
    event: RecipeEditSet,
    payload: RecipeEdit.make({ ...soup, id: recipeId, title }),
  })

const editRemove = (msecs: number) =>
  makeEntry({
    msecs,
    event: RecipeEditRemove,
    payload: { id: recipeId },
  })

const makeLayer = (
  identity: EventLog.Identity["Service"],
  remote: Layer.Layer<never, never, EventLog.Registry>,
) => {
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

type Row = Record<string, unknown>

const withoutLww = ({ _lww, ...fields }: Row): Row => fields

const readTables = Effect.gen(function* () {
  const { indexedDB } = yield* IndexedDb.IndexedDb
  const read = (store: string) =>
    readRecords(indexedDB, databaseName, store).pipe(
      Effect.map((rows) => rows.map(withoutLww)),
    )
  return {
    recipes: yield* read("recipes"),
    recipeEdits: yield* read("recipeEdits"),
  }
})

const describe = (entries: ReadonlyArray<EventJournal.Entry>) =>
  entries.map((entry) => `${entry.event}@${entry.createdAtMillis}`).join(", ")

// Runs every ordering of `concurrent` after `setup` and returns the one state
// they all agree on.
const converge = async (options: {
  readonly setup?: ReadonlyArray<EventJournal.Entry>
  readonly concurrent: ReadonlyArray<EventJournal.Entry>
}) => {
  const identity = await Effect.runPromise(testIdentity)
  const results: Array<{
    readonly order: string
    readonly tables: Effect.Success<typeof readTables>
  }> = []
  for (const order of everyOrder(options.concurrent)) {
    const tables = await Effect.gen(function* () {
      const remote = yield* makeFakeRemote
      return yield* Effect.gen(function* () {
        yield* remote.deliver(options.setup ?? [])
        yield* remote.deliver(order)
        return yield* readTables
      }).pipe(
        // A failing handler stops the replay, and `deliver` would wait forever.
        Effect.timeout("5 seconds"),
        Effect.provide(makeLayer(identity, remote.layer)),
      )
    }).pipe(Effect.runPromise)
    results.push({ order: describe(order), tables })
  }
  const [first, ...rest] = results
  for (const result of rest) {
    assert.deepStrictEqual(
      result.tables,
      first.tables,
      `[${result.order}] diverged from [${first.order}]`,
    )
  }
  return first.tables
}

const only = (rows: ReadonlyArray<Row>): Row => {
  assert.equal(rows.length, 1)
  return rows[0]
}

const pick = (row: Row, keys: ReadonlyArray<string>) =>
  Object.fromEntries(keys.map((key) => [key, row[key]]))

test("the Recipes group is in the catalogue, keyed by the canonical id string", () => {
  assert.ok(
    (CheffectEvents.groups as ReadonlyArray<unknown>).includes(RecipeEvents),
  )
  assert.deepEqual(Object.keys(RecipeEvents.events).sort(), [
    "RecipeCreated",
    "RecipeDeleted",
    "RecipeEditRemove",
    "RecipeEditSet",
    "RecipeSetIngredientScale",
    "RecipeUpdated",
  ])
  for (const entry of [
    created,
    updated(2000),
    scaled(2000, 2),
    deleted(2000),
    editSet(2000, "Draft"),
    editRemove(2000),
  ]) {
    assert.equal(entry.primaryKey, recipeIdString, entry.event)
  }
})

test("concurrent writes to different recipe fields both land", async () => {
  const { recipes, recipeEdits } = await converge({
    setup: [created],
    concurrent: [updated(2000, { title: "Carrot soup" }), scaled(3000, 2)],
  })
  const recipe = only(recipes)
  assert.deepEqual(
    pick(recipe, ["title", "ingredientScale", "updatedAt", "deletedAt"]),
    {
      title: "Carrot soup",
      ingredientScale: 2,
      updatedAt: 3000,
      deletedAt: null,
    },
  )
  // Ids are UUID bytes; ingredients and steps are stored as arrays, not JSON.
  assert.ok(recipe.id instanceof Uint8Array)
  assert.equal(recipe.id.length, 16)
  assert.ok(Array.isArray(recipe.ingredients))
  assert.ok(Array.isArray(recipe.steps))
  assert.deepEqual(recipeEdits, [])
})

test("on the same recipe field the newest entry wins, not the newest updatedAt", async () => {
  const { recipes } = await converge({
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
    setup: [created],
    concurrent: [updated(2000, { title: "Carrot soup" }), deleted(3000)],
  })
  assert.deepEqual(pick(only(recipes), ["title", "deletedAt"]), {
    title: "Carrot soup",
    deletedAt: 3000,
  })
})

test("a recipe edit newer than a delete restores the recipe", async () => {
  // Soft delete is just the `deletedAt` field under last-writer-wins, and a
  // whole-form save stamps it too.
  const { recipes } = await converge({
    setup: [created],
    concurrent: [deleted(2000), updated(3000, { title: "Carrot soup" })],
  })
  assert.deepEqual(pick(only(recipes), ["title", "deletedAt"]), {
    title: "Carrot soup",
    deletedAt: null,
  })
})

test("a recipe edit can be removed and set again", async () => {
  const { recipes, recipeEdits } = await converge({
    concurrent: [
      editSet(1000, "Draft 1"),
      editRemove(2000),
      editSet(3000, "Draft 2"),
    ],
  })
  assert.deepEqual(pick(only(recipeEdits), ["title", "deleted"]), {
    title: "Draft 2",
    deleted: 0,
  })
  assert.deepEqual(recipes, [])
})

test("a recipe edit removed last stays a tombstone, even when the remove arrives first", async () => {
  const { recipeEdits } = await converge({
    concurrent: [
      editSet(1000, "Draft 1"),
      editSet(2000, "Draft 2"),
      editRemove(3000),
    ],
  })
  assert.equal(only(recipeEdits).deleted, 1)
})
