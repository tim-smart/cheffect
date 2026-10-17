import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import {
  GroceryAisle,
  GroceryItem,
  PANTRY_GROCERY_LIST_NAME,
} from "@/domain/GroceryItem"
import { compareText } from "@/lib/text"
import { AiHelpers, openAiClientLayer } from "@/services/AiHelpers"
import { groceryCurrentListAtom } from "./currentList"
import {
  aisleOrder,
  autocomplete,
  GroceryRepo,
  learnedAisle,
  listItems,
  listNames,
} from "./Repo"
import {
  type GroceryItemWrite,
  groceriesRuntime,
  writeGroceryItems,
} from "./runtime"

// Reads

const itemsAtom = groceriesRuntime
  .atom(GroceryRepo.useSync((_) => _.itemsStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const aislesAtom = groceriesRuntime
  .atom(GroceryRepo.useSync((_) => _.aislesStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const aisleOrdersAtom = groceriesRuntime
  .atom(GroceryRepo.useSync((_) => _.aisleOrdersStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

// The current list's items, by name.
export const groceryItemsAtom = Atom.make((get) => {
  const list = get(groceryCurrentListAtom)
  return AsyncResult.map(get(itemsAtom), (items) => listItems(items, list))
})

export const groceryListNamesAtom = Atom.make((get) =>
  AsyncResult.map(get(itemsAtom), listNames),
)

const fallbackAisleOrder = [...GroceryAisle.literals, "Other"]

// The current list's items grouped by aisle, in the list's aisle order. Items
// without an aisle go under "Other", after the named aisles unless the list
// has moved it.
export const groceryCountAtom = Atom.make((get) => {
  const list = get(groceryCurrentListAtom)
  const orderMap = get(aisleOrdersAtom).pipe(
    AsyncResult.map((orders) => aisleOrder(orders, list)),
    AsyncResult.getOrElse((): ReadonlyMap<string, number> => new Map()),
  )
  const getOrder = (name: string) => {
    const stored = orderMap.get(name)
    if (stored !== undefined) return stored
    const index = fallbackAisleOrder.indexOf(name)
    return index === -1 ? 1000 : index
  }
  return get(groceryItemsAtom).pipe(
    AsyncResult.map((items) => {
      const byAisle = new Map<string, Array<GroceryItem>>()
      let completed = 0
      for (const item of items) {
        if (item.completed) completed++
        const aisle = item.aisle ?? "Other"
        const existing = byAisle.get(aisle)
        if (existing) {
          existing.push(item)
        } else {
          byAisle.set(aisle, [item])
        }
      }
      const aisles = Array.from(byAisle, ([name, items]) => ({ name, items }))
      aisles.sort(
        ({ name: a }, { name: b }) =>
          getOrder(a) - getOrder(b) || compareText(a, b),
      )
      return { total: items.length, completed, aisles }
    }),
  )
})

// Autocomplete for the item name field, from the learned ingredient names.
export const groceryNameAtom = Atom.make("")

export const groceryNameAutoCompleteAtom = Atom.make((get) => {
  const query = get(groceryNameAtom)
  return get(aislesAtom).pipe(
    AsyncResult.map((aisles) => autocomplete(aisles, query)),
    AsyncResult.getOrElse((): ReadonlyArray<string> => []),
  )
})

// Writes

const beautifyRuntime = Atom.runtime((get) =>
  Layer.mergeAll(AiHelpers.layer, get(groceriesRuntime.layer)).pipe(
    Layer.provide(get(openAiClientLayer)),
  ),
)

export const beautifyGroceriesAtom = beautifyRuntime
  .fn<void>()(
    Effect.fnUntraced(function* (_, get) {
      const repo = yield* GroceryRepo
      const currentItems = yield* repo.list(get(groceryCurrentListAtom))
      yield* Effect.log("Beautifying groceries...", currentItems)
      if (currentItems.length === 0) return
      const previousItems = new Map(
        currentItems.map((item) => [item.idString, item]),
      )
      const pantryItemNames = yield* repo.pantryNames
      const aisles = yield* repo.aisles
      const ai = yield* AiHelpers
      const { removed, updated } = yield* ai.beautifyGroceries(currentItems)
      // Every change is collected first and written as one batch, so a long
      // list is one write rather than a few per item.
      const writes: Array<GroceryItemWrite> = removed.map((item) => ({
        event: "GroceryItemDeleted",
        id: item.id,
      }))
      for (const item of updated) {
        const prev = previousItems.get(item.idString)
        const renamed = prev !== undefined && item.name !== prev.name
        // A renamed item that turns out to be in the pantry goes.
        if (
          renamed &&
          prev.list !== PANTRY_GROCERY_LIST_NAME &&
          pantryItemNames.has(item.nameNormalized)
        ) {
          writes.push({ event: "GroceryItemDeleted", id: item.id })
          continue
        }
        let nextItem = item
        if (renamed) {
          const aisle = learnedAisle(aisles, item.name)
          if (Option.isSome(aisle)) {
            nextItem = new GroceryItem({ ...item, aisle: aisle.value })
          }
        }
        writes.push({
          event: "GroceryItemUpdated",
          item: nextItem,
          previousName: prev?.name,
        })
      }
      yield* writeGroceryItems(writes)
    }),
  )
  .pipe(Atom.keepAlive)
