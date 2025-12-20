import { GroceryAisle, GroceryItem } from "@/domain/GroceryItem"
import { Store } from "@/livestore/atoms"
import {
  allGroceryItemsArrayAtom,
  allGroceryItemsAtom,
} from "@/livestore/queries"
import { events } from "@/livestore/schema"
import { AiHelpers, openAiClientLayer } from "@/services/AiHelpers"
import { Atom } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const groceryItemAddAtom = Atom.fnSync<GroceryItem>()((item, get) => {
  const store = get(Store.storeUnsafe)!
  if (!item.aisle) {
    const maybePrevItem = store.query(previousGroceryItem$(item.name))
    if (maybePrevItem._tag === "Some") {
      item = new GroceryItem({
        ...item,
        aisle: maybePrevItem.value.aisle,
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
      const previousItems = new Map<string, GroceryItem>()
      for (const item of currentItems) {
        previousItems.set(item.id, item)
      }
      const ai = yield* AiHelpers
      const { removed, updated } = yield* ai.beautifyGroceries(currentItems)
      for (const item of removed) {
        store.commit(events.groceryItemDeleted({ id: item.id }))
      }
      for (const item of updated) {
        store.commit(
          events.groceryItemUpdated({
            ...item,
            previousName: previousItems.get(item.id)?.name ?? null,
          }),
        )
      }
    }),
  )
  .pipe(Atom.keepAlive)

export const previousGroceryItem$ = (name: string) => {
  const nameNormalized = name.trim().toLowerCase()
  return queryDb(
    {
      query: sql`
        select name, aisle, previousName
        from ingredient_aisles
        where name = ? or previousName = ?
        order by previousName IS NULL DESC`,
      bindValues: [nameNormalized, nameNormalized],
      schema: NameAndAisle,
    },
    { deps: [name], map: Array.head },
  )
}

const NameAndAisle = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    aisle: GroceryAisle,
    previousName: Schema.NullOr(Schema.String),
  }),
)
