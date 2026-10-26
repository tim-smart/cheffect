import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import {
  layerHandlerTransaction,
  layerJournal,
  writeEvent,
  writeEvents,
} from "@/EventLog"
import { QueryBuilder, databaseName, layerDatabase } from "@/IndexedDb"
import { RecipesLayer } from "@/Recipes"
import {
  RecipeEditEvent,
  RecipeEvent,
  RecipeEvents,
  recipeIngredientScale,
} from "@/Recipes/Events"
import { RecipeRepo } from "@/Recipes/Repo"
import { ExtractedRecipe, Recipe } from "@/domain/Recipe"
import {
  type FakeRemote,
  makeEntry,
  makeFakeRemote,
  testIdentity,
} from "./harness/eventlog"
import { freshIndexedDb, layerFreshIndexedDb } from "./harness/indexeddb"

// After any write the recipes snapshot must hold what a new page load would
// read: the same recipes, in the same order, whether the write was a local
// batch, a remote batch, or rolled back.

const recipeEvent = RecipeEvents.events[RecipeEvent.tag]

const device = (
  remote: FakeRemote,
  handlers: typeof RecipesLayer = RecipesLayer,
  indexedDb: Layer.Layer<IndexedDb.IndexedDb> = layerFreshIndexedDb,
) => {
  const eventLog = EventLog.layer(EventLog.schema(RecipeEvents), handlers).pipe(
    Layer.provideMerge(layerJournal),
    Layer.provide(layerHandlerTransaction),
    Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  )
  return Layer.mergeAll(
    eventLog,
    RecipeRepo.layer,
    remote.layer.pipe(Layer.provide(eventLog)),
  ).pipe(
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(indexedDb),
  )
}

const recipe = (title: string) =>
  new ExtractedRecipe({
    title,
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [],
    steps: [],
    sourceName: null,
  }).asRecipe()

const library = Array.from({ length: 8 }, (_, i) => recipe(`Recipe ${i}`))

// The recipes a new page load reads from the same database.
const reopened = RecipeRepo.use((repo) => repo.current).pipe(
  Effect.provide(
    Layer.fresh(
      RecipeRepo.layer.pipe(
        Layer.provideMerge(QueryBuilder.layer),
        Layer.provideMerge(layerDatabase),
        Layer.provideMerge(Reactivity.layer),
      ),
    ),
  ),
)

const summary = (all: ReadonlyArray<Recipe>) =>
  all.map((r) => [r.idString, r.title, r.ingredientScale])

// The snapshot once `done` holds, and what a new page load reads then.
const settled = (done: (all: ReadonlyArray<Recipe>) => boolean) =>
  Effect.gen(function* () {
    const repo = yield* RecipeRepo
    let current = yield* repo.current
    while (!done(current.all)) {
      yield* Effect.sleep("2 millis")
      current = yield* repo.current
    }
    return {
      all: current.all,
      snapshot: summary(current.all),
      reopened: summary((yield* reopened).all),
    }
  }).pipe(Effect.timeout("5 seconds"))

const has = (target: Recipe) => (all: ReadonlyArray<Recipe>) =>
  all.some((r) => r.idString === target.idString)

test("a remote batch shows the recipes it adds and changes", async () => {
  const [, scaled] = library
  const added = recipe("Synced soup")
  const result = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* writeEvents(library.map((r) => RecipeEvent.set(r)))
      yield* settled((all) => all.length === library.length)
      yield* remote.deliver([
        makeEntry({
          msecs: Date.now(),
          event: recipeEvent,
          payload: RecipeEvent.set(added).payload,
        }),
        makeEntry({
          msecs: Date.now() + 1,
          event: recipeEvent,
          payload: recipeIngredientScale(scaled.id, 3, DateTime.nowUnsafe())
            .payload,
        }),
      ])
      return yield* settled(has(added))
    }).pipe(Effect.provide(device(remote)))
  }).pipe(Effect.runPromise)

  assert.deepEqual(result.snapshot, result.reopened)
  assert.equal(result.snapshot.length, library.length + 1)
  assert.deepEqual(
    result.snapshot.find(([id]) => id === scaled.idString)?.[2],
    3,
  )
})

// A recipe edit remove fails, after the recipe writes before it in the batch.
const failingEditRemove = Layer.effectDiscard(
  EventLog.Registry.use((registry) =>
    Effect.sync(() => {
      const handler = registry.handlers.get(RecipeEditEvent.tag)!
      registry.registerHandlerUnsafe({
        event: RecipeEditEvent.tag,
        handler: {
          ...handler,
          handler: (options) =>
            (options.payload as { readonly _tag: string })._tag === "remove"
              ? Effect.die("remove failed")
              : handler.handler(options),
        },
      })
    }),
  ),
).pipe(Layer.provideMerge(RecipesLayer))

test("a rolled-back batch leaves the snapshot as a new page load reads it", async () => {
  const [scaled] = library
  const rolledBack = recipe("Never stored")
  const later = recipe("Stored later")
  const result = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* writeEvents(library.map((r) => RecipeEvent.set(r)))
      yield* settled((all) => all.length === library.length)
      const failed = yield* Effect.exit(
        writeEvents([
          RecipeEvent.set(rolledBack),
          recipeIngredientScale(scaled.id, 3, DateTime.nowUnsafe()),
          RecipeEditEvent.remove({ id: scaled.id }),
        ]),
      )
      // The next write's reload shows whatever the failed one left behind.
      yield* writeEvent(RecipeEvent.set(later))
      const after = yield* settled(has(later))
      return { ...after, failed: Exit.isFailure(failed) }
    }).pipe(Effect.provide(device(remote, failingEditRemove)))
  }).pipe(Effect.runPromise)

  assert.equal(result.failed, true)
  assert.deepEqual(result.snapshot, result.reopened)
  assert.equal(result.snapshot.length, library.length + 1)
  assert.equal(has(rolledBack)(result.all), false)
  assert.deepEqual(
    result.snapshot.find(([id]) => id === scaled.idString)?.[2],
    1,
  )
})

// Another tab writes to the same database. Its entry reaches this tab as a
// duplicate in a remote batch, which invalidates the recipe without running
// its handler here, next to a fresh entry whose handler reports its key.
test("a remote batch with a duplicate entry still shows the duplicate's write", async () => {
  const [fresh, duplicated] = library
  const shared = Layer.succeed(IndexedDb.IndexedDb, freshIndexedDb())
  const result = await Effect.gen(function* () {
    const remote = yield* makeFakeRemote
    const otherRemote = yield* makeFakeRemote
    return yield* Effect.gen(function* () {
      yield* writeEvents(library.map((r) => RecipeEvent.set(r)))
      yield* settled((all) => all.length === library.length)
      const entry = yield* Effect.gen(function* () {
        yield* writeEvent(
          recipeIngredientScale(duplicated.id, 5, DateTime.nowUnsafe()),
        )
        const entries = yield* EventLog.EventLog.use((log) => log.entries)
        return entries.at(-1)!
      }).pipe(
        Effect.provide(Layer.fresh(device(otherRemote, RecipesLayer, shared))),
      )
      yield* remote.deliver([
        entry,
        makeEntry({
          msecs: Date.now() + 1,
          event: recipeEvent,
          payload: recipeIngredientScale(fresh.id, 3, DateTime.nowUnsafe())
            .payload,
        }),
      ])
      const scale = (all: ReadonlyArray<Recipe>, target: Recipe) =>
        all.find((r) => r.idString === target.idString)?.ingredientScale
      return yield* settled(
        (all) => scale(all, fresh) === 3 && scale(all, duplicated) === 5,
      )
    }).pipe(Effect.provide(device(remote, RecipesLayer, shared)))
  }).pipe(Effect.runPromise)

  assert.deepEqual(result.snapshot, result.reopened)
})

// Where there is no BroadcastChannel nothing tells this tab what another tab
// wrote, so the snapshot must not reload only the keys it reports itself.
test("without a BroadcastChannel, this tab's next write shows another tab's write", async () => {
  const [mine, theirs] = library
  const shared = Layer.succeed(IndexedDb.IndexedDb, freshIndexedDb())
  const channel = globalThis.BroadcastChannel
  ;(globalThis as any).BroadcastChannel = undefined
  try {
    const result = await Effect.gen(function* () {
      const remote = yield* makeFakeRemote
      const otherRemote = yield* makeFakeRemote
      return yield* Effect.gen(function* () {
        yield* writeEvents(library.map((r) => RecipeEvent.set(r)))
        yield* settled((all) => all.length === library.length)
        yield* writeEvent(
          recipeIngredientScale(theirs.id, 5, DateTime.nowUnsafe()),
        ).pipe(
          Effect.provide(
            Layer.fresh(device(otherRemote, RecipesLayer, shared)),
          ),
        )
        yield* writeEvent(
          recipeIngredientScale(mine.id, 3, DateTime.nowUnsafe()),
        )
        const scale = (all: ReadonlyArray<Recipe>, target: Recipe) =>
          all.find((r) => r.idString === target.idString)?.ingredientScale
        return yield* settled((all) => scale(all, mine) === 3).pipe(
          Effect.map((after) => ({
            ...after,
            theirs: scale(after.all, theirs),
          })),
        )
      }).pipe(Effect.provide(device(remote, RecipesLayer, shared)))
    }).pipe(Effect.runPromise)

    assert.equal(result.theirs, 5)
    assert.deepEqual(result.snapshot, result.reopened)
  } finally {
    globalThis.BroadcastChannel = channel
  }
})

// Builds before `TableChanges` open version 3 and report no keys. Opening the
// database must make such a tab close its connection, as it does on any
// version change, rather than keep writing beside this one.
test("opening the database makes a tab on the version before close", async () => {
  const idb = freshIndexedDb()
  const previous = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.indexedDB.open(databaseName, 3)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  let versionChanged = false
  previous.onversionchange = () => {
    versionChanged = true
    previous.close()
  }
  await Layer.build(layerDatabase).pipe(
    Effect.scoped,
    Effect.provide(Layer.succeed(IndexedDb.IndexedDb, idb)),
    Effect.timeout("5 seconds"),
    Effect.runPromise,
  )
  assert.equal(versionChanged, true)
})
