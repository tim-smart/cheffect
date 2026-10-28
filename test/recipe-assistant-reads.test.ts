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
import { showOriginalRecipeAtom, shownRecipes } from "@/Recipes/runtime"
import { ExtractedRecipe } from "@/domain/Recipe"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// The assistant reads a recipe as the user sees it: with its unsaved edits,
// unless the user switched back to the original.

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
  servings: null,
  ingredients: [],
  steps: [],
  sourceName: null,
}).asRecipe()

const assistantReads = (showOriginal: boolean) =>
  Effect.gen(function* () {
    yield* writeEvents([
      RecipeEvent.set(soup),
      RecipeEditEvent.set({ ...soup, title: "Spicy chicken soup" }),
    ])
    if (showOriginal) {
      // Mounted, as the recipe page's edit banner holds it.
      const registry = yield* AtomRegistry.AtomRegistry
      registry.mount(showOriginalRecipeAtom)
      registry.set(showOriginalRecipeAtom, HashSet.make(soup.idString))
    }
    const shown = yield* shownRecipes
    const byId = yield* shown.byId(soup.idString)
    const search = yield* shown.search("chicken")
    return {
      byId: Option.map(byId, (recipe) => recipe.title),
      search: search.map((recipe) => recipe.title),
    }
  }).pipe(Effect.provide(layer), Effect.runPromise)

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
