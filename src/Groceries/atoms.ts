import { GroceryItem } from "@/domain/GroceryItem"
import { Store } from "@/livestore/atoms"
import {
  allGroceryItemsArrayAtom,
  allGroceryItemsAtom,
} from "@/livestore/queries"
import { events } from "@/livestore/schema"
import { AiHelpers } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

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

const runtime = Atom.runtime(Layer.mergeAll(AiHelpers.Default, Store.layer))

export const beautifyGroceriesAtom = runtime
  .fn<void>()(
    Effect.fnUntraced(function* (_, get) {
      const store = yield* Store
      const currentItems = yield* get.result(allGroceryItemsArrayAtom)
      yield* Effect.log("Beautifying groceries...", currentItems)
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
