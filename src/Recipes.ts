import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { QueryBuilder } from "./IndexedDb"
import { tableRowHandler } from "./lib/rowHandler"
import { RecipeEditEvent, RecipeEvent, RecipeEvents } from "./Recipes/Events"

const RecipesHandlers = EventLog.group(RecipeEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers
      .handle(
        RecipeEvent.tag,
        tableRowHandler(db, "recipes", RecipeEvent, {
          tableKey: ({ id }) => id,
        }),
      )
      .handle(
        RecipeEditEvent.tag,
        tableRowHandler(db, "recipeEdits", RecipeEditEvent, {
          tableKey: ({ id }) => id,
        }),
      )
  }),
)

const RecipesReactivity = EventLog.groupReactivity(RecipeEvents, {
  [RecipeEvent.tag]: ["recipes"],
  [RecipeEditEvent.tag]: ["recipeEdits"],
})

export const RecipesLayer = Layer.mergeAll(
  RecipesHandlers,
  RecipesReactivity,
  EventRow.compaction(RecipeEvents, RecipeEvent),
  EventRow.compaction(RecipeEvents, RecipeEditEvent),
)
