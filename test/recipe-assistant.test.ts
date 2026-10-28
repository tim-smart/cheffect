import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as HashSet from "effect/HashSet"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as EventLog from "effect/eventlog/EventLog"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import { layerHandlerTransaction, layerJournal, writeEvents } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { RecipesLayer } from "@/Recipes"
import { RecipeEditEvent, RecipeEvent, RecipeEvents } from "@/Recipes/Events"
import { RecipeRepo } from "@/Recipes/Repo"
import { assistantRecipes, showOriginalRecipeAtom } from "@/Recipes/runtime"
import { ExtractedRecipe } from "@/domain/Recipe"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// The assistant reads a recipe as the user sees it: with its unsaved edits,
// unless the user switched back to the original. Its edits add to the unsaved
// ones rather than replacing them.

const layer = Layer.mergeAll(
  EventLog.layer(EventLog.schema(RecipeEvents), RecipesLayer).pipe(
    Layer.provideMerge(layerJournal),
    Layer.provide(layerHandlerTransaction),
    Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  ),
  RecipeRepo.layer,
  AtomRegistry.layer,
).pipe(
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(layerFreshIndexedDb),
)

const soup = new ExtractedRecipe({
  title: "Chicken soup",
  imageUrl: null,
  prepTime: null,
  cookingTime: null,
  servings: 4,
  ingredients: [],
  steps: [],
  sourceName: null,
}).asRecipe()

// The soup with an unsaved edit, optionally with the user showing the original.
const withPendingEdit = (showOriginal: boolean) =>
  Effect.gen(function* () {
    yield* writeEvents([
      RecipeEvent.set(soup),
      RecipeEditEvent.set({
        ...soup,
        title: "Spicy chicken soup",
        servings: 7,
      }),
    ])
    if (showOriginal) {
      // Mounted, as the recipe page's edit banner holds it.
      const registry = yield* AtomRegistry.AtomRegistry
      registry.mount(showOriginalRecipeAtom)
      registry.set(showOriginalRecipeAtom, HashSet.make(soup.idString))
    }
    return yield* assistantRecipes
  })

const shownSoup = (recipes: Effect.Success<typeof assistantRecipes>) =>
  Effect.map(recipes.byId(soup.idString), (found) =>
    Option.map(found, ({ title, servings }) => ({ title, servings })),
  )

const run = <A, E>(effect: Effect.Effect<A, E, Layer.Success<typeof layer>>) =>
  effect.pipe(Effect.provide(layer), Effect.runPromise)

const assistantReads = (showOriginal: boolean) =>
  run(
    Effect.gen(function* () {
      const recipes = yield* withPendingEdit(showOriginal)
      const byId = yield* recipes.byId(soup.idString)
      const search = yield* recipes.search("chicken")
      return {
        byId: Option.map(byId, (recipe) => recipe.title),
        search: search.map((recipe) => recipe.title),
      }
    }),
  )

test("the assistant reads a recipe's unsaved edits", async () => {
  assert.deepEqual(await assistantReads(false), {
    byId: Option.some("Spicy chicken soup"),
    search: ["Spicy chicken soup"],
  })
})

test("the assistant reads the original when the user shows the original", async () => {
  assert.deepEqual(await assistantReads(true), {
    byId: Option.some("Chicken soup"),
    search: ["Chicken soup"],
  })
})

test("an edit while the original is shown keeps the unsaved edits it leaves out", async () => {
  const shown = await run(
    Effect.gen(function* () {
      const recipes = yield* withPendingEdit(true)
      yield* recipes.suggestEdit(soup.idString, { title: "Leek soup" })
      return yield* shownSoup(recipes)
    }),
  )
  assert.deepEqual(shown, Option.some({ title: "Leek soup", servings: 7 }))
})

test("edits suggested together all land", async () => {
  const shown = await run(
    Effect.gen(function* () {
      const recipes = yield* withPendingEdit(false)
      yield* Effect.all(
        [
          recipes.suggestEdit(soup.idString, { title: "Leek soup" }),
          recipes.suggestEdit(soup.idString, { servings: 9 }),
        ],
        { concurrency: "unbounded" },
      )
      return yield* shownSoup(recipes)
    }),
  )
  assert.deepEqual(shown, Option.some({ title: "Leek soup", servings: 9 }))
})

test("an edit clears the fields it lists", async () => {
  const shown = await run(
    Effect.gen(function* () {
      const recipes = yield* withPendingEdit(false)
      yield* recipes.suggestEdit(soup.idString, { clear: ["servings"] })
      return yield* shownSoup(recipes)
    }),
  )
  assert.deepEqual(
    shown,
    Option.some({ title: "Spicy chicken soup", servings: null }),
  )
})
