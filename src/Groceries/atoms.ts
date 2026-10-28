import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { GroceryAisle, GroceryItem } from "@/domain/GroceryItem"
import { compareText } from "@/lib/text"
import { AiHelpers, aiHelpersLayer } from "@/services/AiHelpers"
import { groceryCurrentListAtom } from "./currentList"
import {
  aisleOrder,
  autocomplete,
  GroceryRepo,
  learnedAisle,
  listItems,
  inPantry,
  listNames,
} from "./Repo"
import { IngredientAliasEvent } from "./Events"
import {
  type GroceryItemWrite,
  groceriesRuntime,
  writeGroceryItems,
} from "./runtime"
import { tidyList } from "./tidy"

// Reads

const itemsAtom = groceriesRuntime
  .atom(GroceryRepo.useSync((_) => _.itemsStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const aislesAtom = groceriesRuntime
  .atom(GroceryRepo.useSync((_) => _.aislesStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const aliasesAtom = groceriesRuntime
  .atom(GroceryRepo.useSync((_) => _.aliasesStream).pipe(Stream.unwrap))
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

export const groceryInPantryAtom = Atom.make((get) =>
  AsyncResult.map(
    AsyncResult.all([get(itemsAtom), get(aliasesAtom)]),
    ([items, aliases]) => inPantry(items, aliases),
  ),
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
  return AsyncResult.all([get(aislesAtom), get(aliasesAtom)]).pipe(
    AsyncResult.map(([aisles, aliases]) =>
      autocomplete(aisles, aliases, query),
    ),
    AsyncResult.getOrElse((): ReadonlyArray<string> => []),
  )
})

// Writes

const beautifyRuntime = Atom.runtime((get) =>
  Layer.mergeAll(get(aiHelpersLayer), get(groceriesRuntime.layer)),
)

// The deterministic pass runs first and is written straight away, whatever
// the AI does after, so the model gets names already resolved and fewer
// items without an aisle. The AI's
// renames and merges then teach the alias table, so the next add of the same
// name is cleaned up without it.
export const beautifyGroceriesAtom = beautifyRuntime
  .fn<void>()(
    Effect.fnUntraced(function* (_, get) {
      const repo = yield* GroceryRepo
      const listItems = yield* repo.list(get(groceryCurrentListAtom))
      const currentItems = listItems.filter((item) => !item.completed)
      yield* Effect.log("Beautifying groceries...", currentItems)
      if (currentItems.length === 0) return
      const aisles = yield* repo.aisles
      const tidied = tidyList({
        items: currentItems,
        aisles,
        aliases: yield* repo.aliases,
        now: yield* DateTime.now,
      })
      yield* writeGroceryItems(tidied.writes)
      const ai = yield* AiHelpers
      const { removed, updated, lessons } = yield* ai.beautifyGroceries(
        tidied.items,
      )
      // Every change is collected first and written as one batch, so a long
      // list is one write rather than a few per item.
      const writes: Array<GroceryItemWrite> = removed.map((item) => ({
        op: "remove",
        id: item.id,
      }))
      for (const { previous, item } of updated) {
        const renamed = item.name !== previous.name
        const aisle = renamed ? learnedAisle(aisles, item.name) : Option.none()
        writes.push({
          op: "change",
          previous,
          item: Option.isSome(aisle)
            ? new GroceryItem({ ...item, aisle: aisle.value })
            : item,
        })
      }
      yield* writeGroceryItems(
        writes,
        lessons.map(({ name, canonical }) =>
          IngredientAliasEvent.set({ name, source: "ai", canonical }),
        ),
      )
    }),
  )
  .pipe(Atom.keepAlive)
