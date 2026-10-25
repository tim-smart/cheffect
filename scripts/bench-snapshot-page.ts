// The in-page half of `bench-snapshot.ts`: the recipes EventLog, its handler
// transaction and the recipes repo over the browser's IndexedDB, with a
// remote that delivers whatever it is handed.

import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import type * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import {
  layerHandlerTransaction,
  layerJournal,
  writeEvent,
  writeEvents,
} from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { RecipesLayer } from "@/Recipes"
import {
  RecipeEvent,
  RecipeEvents,
  recipeIngredientScale,
} from "@/Recipes/Events"
import { RecipeRepo, type Recipes } from "@/Recipes/Repo"
import { makeEntry, testIdentity } from "../test/harness/eventlog"
import { makeLibrary } from "./recipeLibrary"

const recipeEvent = RecipeEvents.events[RecipeEvent.tag]

const median = (values: ReadonlyArray<number>) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!

export const run = (options: {
  readonly count: number
  readonly writes: number
  readonly batches: number
  readonly batchSize: number
}) =>
  Effect.gen(function* () {
    const changes = yield* Queue.unbounded<
      EventJournal.RemoteEntry,
      EventLogRemote.EventLogRemoteError
    >()
    let sequence = 0
    const remote = Layer.effectDiscard(
      EventLog.Registry.use((registry) =>
        registry.registerRemote({
          id: EventJournal.makeRemoteIdUnsafe(),
          changes: () => Effect.succeed(changes),
          write: () => Effect.void,
          whenAuthenticated: (effect) => effect,
        }),
      ),
    )
    const eventLog = EventLog.layer(
      EventLog.schema(RecipeEvents),
      RecipesLayer,
    ).pipe(
      Layer.provideMerge(layerJournal),
      Layer.provide(layerHandlerTransaction),
      Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
    )
    const layer = Layer.mergeAll(
      eventLog,
      RecipeRepo.layer,
      remote.pipe(Layer.provide(eventLog)),
    ).pipe(
      Layer.provideMerge(QueryBuilder.layer),
      Layer.provideMerge(layerDatabase),
      Layer.provideMerge(Reactivity.layer),
      Layer.provideMerge(IndexedDb.layerWindow),
    )

    return yield* Effect.gen(function* () {
      const repo = yield* RecipeRepo
      const library = makeLibrary(options.count)
      yield* writeEvents(library.map((recipe) => RecipeEvent.set(recipe)))
      yield* repo.current

      // Milliseconds from starting `write` until the snapshot passes `done`.
      const time = <R>(
        write: Effect.Effect<unknown, unknown, R>,
        done: (recipes: Recipes) => boolean,
      ) =>
        Effect.gen(function* () {
          const seen = yield* repo.stream.pipe(
            Stream.filter(done),
            Stream.take(1),
            Stream.runDrain,
            Effect.forkChild,
          )
          // let the stream subscribe before the write starts
          yield* Effect.sleep("20 millis")
          const start = performance.now()
          yield* write
          yield* Fiber.join(seen)
          return performance.now() - start
        })

      let scale = 1
      const single: Array<number> = []
      for (let i = 0; i < options.writes; i++) {
        const recipe = library[(i * 7919) % library.length]!
        const target = ++scale
        single.push(
          yield* time(
            writeEvent(
              recipeIngredientScale(recipe.id, target, DateTime.nowUnsafe()),
            ),
            (recipes) =>
              recipes.byId.get(recipe.idString)?.ingredientScale === target,
          ),
        )
      }

      const batch: Array<number> = []
      for (let i = 0; i < options.batches; i++) {
        const target = ++scale
        const recipes = Array.from(
          { length: options.batchSize },
          (_, j) =>
            library[(i * options.batchSize + j * 104729) % library.length]!,
        )
        const entries = recipes.map((recipe, j) =>
          makeEntry({
            msecs: Date.now() + j,
            event: recipeEvent,
            payload: recipeIngredientScale(
              recipe.id,
              target,
              DateTime.nowUnsafe(),
            ).payload,
          }),
        )
        batch.push(
          yield* time(
            Queue.offerAll(
              changes,
              entries.map(
                (entry) =>
                  new EventJournal.RemoteEntry({
                    remoteSequence: sequence++,
                    entry,
                  }),
              ),
            ),
            (snapshot) =>
              recipes.every(
                (recipe) =>
                  snapshot.byId.get(recipe.idString)?.ingredientScale ===
                  target,
              ),
          ),
        )
      }

      return { single: median(single), batch: median(batch) }
    }).pipe(Effect.provide(layer))
  }).pipe(Effect.scoped, Effect.runPromise)
