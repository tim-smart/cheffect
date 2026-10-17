import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import {
  type GroceryAisle,
  GroceryItem,
  normalizeIngredientName,
  PANTRY_GROCERY_LIST_NAME,
} from "@/domain/GroceryItem"
import { uuidString } from "@/lib/Id"
import { isLive, stripLww } from "@/lib/Lww"
import { makeSnapshot } from "@/lib/Snapshot"
import { compareText, includesFolded } from "@/lib/text"
import type {
  GroceryAisleOrderRow,
  GroceryItemRow,
  IngredientAisleRow,
} from "./Table"

// Reads
//
// Every read is a pure function over the table snapshots. Ingredient
// aisle and aisle order tombstones never show. An item whose recipe is gone
// still shows; the recipe chip renders nothing for it.

// The learned aisle of each ingredient, by normalised name, in key order.
export type IngredientAisles = ReadonlyMap<string, GroceryAisle>

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// Every write to an item re-stamps the fields it changes, so a row with the
// same stamps as last time holds the same values.
const sameStamps = (a: GroceryItemRow["_lww"], b: GroceryItemRow["_lww"]) => {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

interface DecodedItem {
  readonly row: GroceryItemRow
  readonly item: GroceryItem
}

// Decodes the items, handing back the item it decoded last time for a row
// that hasn't changed since. The grocery page skips re-rendering a row whose
// item is the same value, so a write re-renders only the rows it touched.
const makeItemDecoder = () => {
  let decoded = new Map<string, DecodedItem>()
  return (rows: ReadonlyArray<GroceryItemRow>): ReadonlyArray<GroceryItem> => {
    const next = new Map<string, DecodedItem>()
    const items = rows.map((row) => {
      const id = uuidString(row.id)
      const previous = decoded.get(id)
      const entry =
        previous !== undefined && sameStamps(previous.row._lww, row._lww)
          ? previous
          : { row, item: new GroceryItem(stripLww(row)) }
      next.set(id, entry)
      return entry.item
    })
    decoded = next
    return items
  }
}

const decodeAisles = (
  rows: ReadonlyArray<IngredientAisleRow>,
): IngredientAisles =>
  new Map(rows.filter(isLive).map((row) => [row.name, row.aisle]))

const decodeAisleOrders = (
  rows: ReadonlyArray<GroceryAisleOrderRow>,
): ReadonlyArray<GroceryAisleOrderRow> => rows.filter(isLive)

// A list's items by name. `null` is the default list.
export const listItems = (
  items: ReadonlyArray<GroceryItem>,
  list: string | null,
): ReadonlyArray<GroceryItem> =>
  items
    .filter((item) => item.list === list)
    .sort(
      (a, b) =>
        compareText(a.name, b.name) || compareIds(a.idString, b.idString),
    )

// The default list first, then every named list with items plus the pantry,
// by name.
export const listNames = (
  items: ReadonlyArray<GroceryItem>,
): ReadonlyArray<string | null> => {
  const names = new Set<string>([PANTRY_GROCERY_LIST_NAME])
  for (const item of items) {
    if (item.list !== null) names.add(item.list)
  }
  return [null, ...Array.from(names).sort(compareText)]
}

// The normalised names of what's in the pantry and not checked off.
export const pantryNames = (
  items: ReadonlyArray<GroceryItem>,
): ReadonlySet<string> =>
  new Set(
    items
      .filter(
        (item) => item.list === PANTRY_GROCERY_LIST_NAME && !item.completed,
      )
      .map((item) => item.nameNormalized),
  )

// A list's stored aisle order, by aisle.
export const aisleOrder = (
  orders: ReadonlyArray<GroceryAisleOrderRow>,
  list: string | null,
): ReadonlyMap<string, number> =>
  new Map(
    orders
      .filter((order) => order.list === list)
      .map((order) => [order.aisle, order.sortOrder]),
  )

export const learnedAisle = (
  aisles: IngredientAisles,
  name: string,
): Option.Option<GroceryAisle> =>
  Option.fromUndefinedOr(aisles.get(normalizeIngredientName(name)))

// Ingredient names containing the query, the first 10 in key order (which is
// alphabetical). Shorter queries match nothing.
export const autocomplete = (
  aisles: IngredientAisles,
  query: string,
): ReadonlyArray<string> => {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const out: Array<string> = []
  for (const name of aisles.keys()) {
    if (!includesFolded(name, trimmed)) continue
    out.push(name)
    if (out.length === 10) break
  }
  return out
}

export class GroceryRepo extends Context.Service<GroceryRepo>()(
  "cheffect/Groceries/Repo/GroceryRepo",
  {
    make: Effect.gen(function* () {
      const items = yield* makeSnapshot("groceryItems")
      const aisles = yield* makeSnapshot("ingredientAisles")
      const aisleOrders = yield* makeSnapshot("groceryAisleOrders")

      const decodeItems = makeItemDecoder()
      const currentItems = items.current.pipe(Effect.map(decodeItems))
      const currentAisles = aisles.current.pipe(Effect.map(decodeAisles))

      return {
        itemsStream: items.stream.pipe(Stream.map(decodeItems)),
        aislesStream: aisles.stream.pipe(Stream.map(decodeAisles)),
        aisleOrdersStream: aisleOrders.stream.pipe(
          Stream.map(decodeAisleOrders),
        ),
        // Every item on every list: for export, import and the dev seed.
        items: currentItems,
        list: (list: string | null) =>
          currentItems.pipe(Effect.map((items) => listItems(items, list))),
        listNames: currentItems.pipe(Effect.map(listNames)),
        pantryNames: currentItems.pipe(Effect.map(pantryNames)),
        byId: (id: string) =>
          currentItems.pipe(
            Effect.map((items) =>
              Option.fromUndefinedOr(
                items.find((item) => item.idString === id.toLowerCase()),
              ),
            ),
          ),
        aisles: currentAisles,
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
