import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import {
  GroceryAisleOrderEvent,
  GroceryEvents,
  GroceryItemEvent,
  IngredientAisleEvent,
  IngredientAliasEvent,
} from "./Groceries/Events"
import { QueryBuilder } from "./IndexedDb"
import { normalizeIngredientName } from "./domain/GroceryItem"
import { tableRowHandler } from "./lib/rowHandler"

// Aisles, aisle orders and aliases are stored under their primary keys: the
// normalised name, the `[list, aisle]` key, and the `[source, name]` key.

const GroceryHandlers = EventLog.group(GroceryEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers
      .handle(
        GroceryItemEvent.tag,
        tableRowHandler(db, "groceryItems", GroceryItemEvent, {
          tableKey: ({ id }) => id,
        }),
      )
      .handle(
        IngredientAisleEvent.tag,
        tableRowHandler(db, "ingredientAisles", IngredientAisleEvent, {
          tableKey: IngredientAisleEvent.keyOf,
          toRecord: (row) => ({
            name: IngredientAisleEvent.keyOf(row),
            aisle: row.aisle,
          }),
        }),
      )
      .handle(
        IngredientAliasEvent.tag,
        tableRowHandler(db, "ingredientAliases", IngredientAliasEvent, {
          tableKey: IngredientAliasEvent.keyOf,
          toRecord: (alias) => ({
            id: IngredientAliasEvent.keyOf(alias),
            ...alias,
            name: normalizeIngredientName(alias.name),
          }),
        }),
      )
      .handle(
        GroceryAisleOrderEvent.tag,
        tableRowHandler(db, "groceryAisleOrders", GroceryAisleOrderEvent, {
          tableKey: GroceryAisleOrderEvent.keyOf,
          toRecord: (order) => ({
            id: GroceryAisleOrderEvent.keyOf(order),
            ...order,
          }),
        }),
      )
  }),
)

const GroceryReactivity = EventLog.groupReactivity(GroceryEvents, {
  [GroceryItemEvent.tag]: ["groceryItems"],
  [IngredientAisleEvent.tag]: ["ingredientAisles"],
  [GroceryAisleOrderEvent.tag]: ["groceryAisleOrders"],
  [IngredientAliasEvent.tag]: ["ingredientAliases"],
})

export const GroceriesLayer = Layer.mergeAll(
  GroceryHandlers,
  GroceryReactivity,
  EventRow.compaction(GroceryEvents, GroceryItemEvent),
  EventRow.compaction(GroceryEvents, IngredientAisleEvent),
  EventRow.compaction(GroceryEvents, GroceryAisleOrderEvent),
  EventRow.compaction(GroceryEvents, IngredientAliasEvent),
)
