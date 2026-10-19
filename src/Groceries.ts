import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import {
  GroceryAisleOrderEvent,
  GroceryEvents,
  GroceryItemEvent,
  IngredientAisleEvent,
} from "./Groceries/Events"
import { QueryBuilder } from "./IndexedDb"
import { uuidBytes } from "./lib/Id"
import { tableRowHandler } from "./lib/rowHandler"

// Aisles and aisle orders are stored under their derived keys: the
// normalised name, and the `[list, aisle]` key.

const GroceryHandlers = EventLog.group(GroceryEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers
      .handle(
        GroceryItemEvent.tag,
        tableRowHandler(db, "groceryItems", GroceryItemEvent, {
          tableKey: uuidBytes,
        }),
      )
      .handle(
        IngredientAisleEvent.tag,
        tableRowHandler(db, "ingredientAisles", IngredientAisleEvent, {
          tableKey: (name) => name,
          toRecord: ({ aisle }, name) => ({ name, aisle }),
        }),
      )
      .handle(
        GroceryAisleOrderEvent.tag,
        tableRowHandler(db, "groceryAisleOrders", GroceryAisleOrderEvent, {
          tableKey: (id) => id,
          toRecord: (order, id) => ({ id, ...order }),
        }),
      )
  }),
)

const GroceryReactivity = EventLog.groupReactivity(GroceryEvents, {
  [GroceryItemEvent.tag]: ["groceryItems"],
  [IngredientAisleEvent.tag]: ["ingredientAisles"],
  [GroceryAisleOrderEvent.tag]: ["groceryAisleOrders"],
})

export const GroceriesLayer = Layer.mergeAll(
  GroceryHandlers,
  GroceryReactivity,
  EventRow.compaction(GroceryEvents, GroceryItemEvent),
  EventRow.compaction(GroceryEvents, IngredientAisleEvent),
  EventRow.compaction(GroceryEvents, GroceryAisleOrderEvent),
)
