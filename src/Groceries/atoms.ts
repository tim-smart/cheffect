import { GroceryItem } from "@/domain/GroceryItem"
import { Store } from "@/livestore/atoms"
import {
  allGroceryItemsArrayAtom,
  allGroceryItemsAtom,
} from "@/livestore/queries"
import { events, tables } from "@/livestore/schema"
import { AiHelpers, openAiClientLayer } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import { queryDb } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const ingredientAisleCached$ = (name: string) =>
  queryDb(
    tables.ingredientAisles.select("aisle").where("name", "=", name).limit(1),
    { map: Array.head },
  )

export const groceryItemAddAtom = Atom.fnSync<GroceryItem>()((item, get) => {
  const store = get(Store.storeUnsafe)!
  if (!item.aisle) {
    const maybeAisle = store.query(ingredientAisleCached$(item.nameNormalized))
    if (maybeAisle._tag === "Some") {
      item = new GroceryItem({
        ...item,
        aisle: maybeAisle.value,
      })
    }
  }
  store.commit(events.groceryItemAdded(item))
})

export const groceryCountAtom = Atom.mapResult(allGroceryItemsAtom, (items) => {
  const aisles: Array<{ name: string; items: GroceryItem[] }> = []
  let total = 0
  let completed = 0
  items.forEach((items, aisle) => {
    total += items.length
    completed += items.filter((item) => item.completed).length
    aisles.push({ name: aisle, items })
  })
  return { total, completed, aisles }
})

const runtime = Atom.runtime((get) =>
  Layer.mergeAll(AiHelpers.Default, get(Store.layer)).pipe(
    Layer.provide(get(openAiClientLayer)),
  ),
)

export const beautifyGroceriesAtom = runtime
  .fn<void>()(
    Effect.fnUntraced(function* (_, get) {
      const store = yield* Store
      const currentItems = yield* get.result(allGroceryItemsArrayAtom)
      yield* Effect.log("Beautifying groceries...", currentItems)
      if (currentItems.length === 0) return
      const ai = yield* AiHelpers
      const { removed, updated } = yield* ai.beautifyGroceries(currentItems)
      for (const item of removed) {
        store.commit(events.groceryItemDeleted({ id: item.id }))
      }
      for (const item of updated) {
        store.commit(events.groceryItemUpdated(item))
      }
    }),
  )
  .pipe(Atom.keepAlive)
