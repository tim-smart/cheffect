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
  sameRecipeIds,
} from "@/domain/GroceryItem"
import { uuidString } from "@/lib/Id"
import { makeSnapshot } from "@/lib/Snapshot"
import { compareText, includesFolded } from "@/lib/text"
import { canonicalKey, decodeAliases, type IngredientAliases } from "./aliases"
import type {
  GroceryAisleOrderRow,
  GroceryItemRow,
  IngredientAisleRow,
} from "./Table"

// Reads
//
// Every read is a pure function over the table snapshots. An item whose
// recipe is gone still shows; the recipe chip renders nothing for it.

// The learned aisle of each ingredient, by normalised name, in key order.
export type IngredientAisles = ReadonlyMap<string, GroceryAisle>

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// Whether two rows for the same item hold the same values.
const sameRow = (a: GroceryItemRow, b: GroceryItemRow) =>
  a.list === b.list &&
  a.name === b.name &&
  a.quantity === b.quantity &&
  a.aisle === b.aisle &&
  a.completed === b.completed &&
  sameRecipeIds(a.recipeIds, b.recipeIds) &&
  a.createdAt.epochMilliseconds === b.createdAt.epochMilliseconds &&
  a.updatedAt.epochMilliseconds === b.updatedAt.epochMilliseconds

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
        previous !== undefined && sameRow(previous.row, row)
          ? previous
          : { row, item: new GroceryItem(row) }
      next.set(id, entry)
      return entry.item
    })
    decoded = next
    return items
  }
}

const decodeAisles = (
  rows: ReadonlyArray<IngredientAisleRow>,
): IngredientAisles => new Map(rows.map((row) => [row.name, row.aisle]))

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

// Whether a name is in the pantry and not checked off, matched by canonical
// name on both sides.
export const inPantry = (
  items: ReadonlyArray<GroceryItem>,
  aliases: IngredientAliases,
): ((name: string) => boolean) => {
  const names = new Set(
    items
      .filter(
        (item) => item.list === PANTRY_GROCERY_LIST_NAME && !item.completed,
      )
      .map((item) => canonicalKey(aliases, item.name)),
  )
  return (name) => names.has(canonicalKey(aliases, name))
}

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
// alphabetical). Shorter queries match nothing, and a name with an alias is
// left out for its canonical name.
export const autocomplete = (
  aisles: IngredientAisles,
  aliases: IngredientAliases,
  query: string,
): ReadonlyArray<string> => {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const out: Array<string> = []
  for (const name of aisles.keys()) {
    if (!includesFolded(name, trimmed)) continue
    if (canonicalKey(aliases, name) !== name) continue
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
      const aliases = yield* makeSnapshot("ingredientAliases")

      const decodeItems = makeItemDecoder()
      const currentItems = items.current.pipe(Effect.map(decodeItems))
      const currentAisles = aisles.current.pipe(Effect.map(decodeAisles))
      const currentAliases = aliases.current.pipe(Effect.map(decodeAliases))

      return {
        itemsStream: items.stream.pipe(Stream.map(decodeItems)),
        aislesStream: aisles.stream.pipe(Stream.map(decodeAisles)),
        aisleOrdersStream: aisleOrders.stream,
        aliasesStream: aliases.stream.pipe(Stream.map(decodeAliases)),
        // Every item on every list: for export, import and the dev seed.
        items: currentItems,
        list: (list: string | null) =>
          currentItems.pipe(Effect.map((items) => listItems(items, list))),
        listNames: currentItems.pipe(Effect.map(listNames)),
        inPantry: Effect.zipWith(currentItems, currentAliases, inPantry),
        byId: (id: string) =>
          currentItems.pipe(
            Effect.map((items) =>
              Option.fromUndefinedOr(
                items.find((item) => item.idString === id.toLowerCase()),
              ),
            ),
          ),
        aisles: currentAisles,
        aliases: currentAliases,
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
