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
    const maybePrevItem = store.query(previousGroceryAisle$(item.name))
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
  aisles.sort(({ name: a }, { name: b }) => {
    const aIndex =
      a === "Other" ? 1000 : GroceryAisle.literals.indexOf(a as any)
    const bIndex =
      b === "Other" ? 1000 : GroceryAisle.literals.indexOf(b as any)
    return aIndex - bIndex
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
        store.commit(events.groceryItemUpdated(item))
      }
    }),
  )
  .pipe(Atom.keepAlive)

export const previousGroceryAisle$ = (name: string) => {
  const nameNormalized = name.trim().toLowerCase()
  return queryDb(
    {
      query: sql`select name, aisle from ingredient_aisles where name = ?`,
      bindValues: [nameNormalized],
      schema: NameAndAisle,
    },
    { deps: [name], map: Array.head },
  )
}

const groceryItemNames$ = (name: string) => {
  const nameNormalized = name.trim().toLowerCase()
  return queryDb(
    {
      query: sql`
        select name
        from ingredient_aisles
        where name LIKE '%' || ? || '%'`,
      bindValues: [nameNormalized],
      schema: NameOnly,
    },
    { deps: [name] },
  )
}

const NameAndAisle = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    aisle: GroceryAisle,
  }),
)

const NameOnly = Schema.Array(
  Schema.Struct({
    name: Schema.String,
  }),
)

export const groceryNameAtom = Atom.make("")

export const groceryNameAutoCompleteAtom = Atom.make((get) => {
  const store = get(Store.storeUnsafe)
  if (!store) return []
  const name = get(groceryNameAtom).trim().toLowerCase()
  if (name.length < 2) return []
  const results = store.query(groceryItemNames$(name))
  const out = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    out.push(result.name)
    if (out.length === 10) break
  }
  return out
})
