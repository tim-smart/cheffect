import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import Fraction from "fraction.js"
import { dictionaryAisle } from "@/domain/GroceryAisleDictionary"
import {
  type GroceryAisle,
  GroceryItem,
  unionRecipeIds,
} from "@/domain/GroceryItem"
import { quantityFormatter } from "@/lib/quantity"
import { type IngredientAisles, learnedAisle } from "./Repo"
import type { GroceryItemWrite } from "./runtime"

// The cleanup every add gets, without AI: an item that's already on its list
// takes the new quantity instead of a second line, and an item without an
// aisle gets a likely one.

// A whole number, decimal, fraction or mixed number, as the quantity
// formatter writes a count without a unit.
const count = /^(?:\d+(?:\.\d+)?|\d+\/\d+|\d+ \d+\/\d+)$/

// The two quantities as one, when they can be added without guessing: both
// empty, or both a bare count. Anything with a unit or a word in it stays
// apart until quantities are stored with their units.
export const mergeQuantities = (
  a: string | null,
  b: string | null,
): Option.Option<string | null> => {
  const x = a?.trim() || null
  const y = b?.trim() || null
  if (x === null && y === null) return Option.some(null)
  if (x === null || y === null || !count.test(x) || !count.test(y)) {
    return Option.none()
  }
  const sum = new Fraction(x).add(new Fraction(y)).valueOf()
  return Option.some(quantityFormatter.format(sum, null))
}

// The aisle for a name: the one learned for it, then the one learned for the
// part before a comma ("garlic, minced"), then the dictionary's.
export const guessAisle = (
  aisles: IngredientAisles,
  name: string,
): GroceryAisle | null => {
  const learned = learnedAisle(aisles, name)
  if (Option.isSome(learned)) return learned.value
  const comma = name.indexOf(",")
  if (comma > 0) {
    const head = learnedAisle(aisles, name.slice(0, comma))
    if (Option.isSome(head)) return head.value
  }
  return dictionaryAisle(name)
}

const listKey = (item: GroceryItem) =>
  JSON.stringify([item.list, item.nameNormalized])

// The writes that add `incoming` given what's on the lists now. An item
// whose name is already on its list, not checked off, with a quantity that
// adds up, is merged into it; so is one repeated within `incoming`. A merge
// into an item already on the list only writes its quantity and recipes, so
// a check made meanwhile on another device stands. The rest are added, with
// a guessed aisle when they have none.
export const planGroceryAdds = (options: {
  readonly existing: ReadonlyArray<GroceryItem>
  readonly aisles: IngredientAisles
  readonly incoming: ReadonlyArray<GroceryItem>
  readonly now: DateTime.Utc
}): Array<GroceryItemWrite> => {
  // The item each name on each list merges into: what's there now, then the
  // first item this batch adds under the name.
  const targets = new Map<string, GroceryItem>()
  for (const item of options.existing) {
    const key = listKey(item)
    if (!item.completed && !targets.has(key)) targets.set(key, item)
  }
  // By the item written, in the order first written. A later merge into the
  // same item replaces its write.
  const writes = new Map<string, GroceryItemWrite>()
  for (const item of options.incoming) {
    const key = listKey(item)
    const target = targets.get(key)
    const quantity = target
      ? mergeQuantities(target.quantity, item.quantity)
      : Option.none()
    if (target !== undefined && Option.isSome(quantity)) {
      const merged = new GroceryItem({
        ...target,
        quantity: quantity.value,
        recipeIds: unionRecipeIds(target.recipeIds, item.recipeIds),
        updatedAt: options.now,
      })
      targets.set(key, merged)
      const write = writes.get(merged.idString)
      writes.set(
        merged.idString,
        write?.op === "add"
          ? { ...write, item: merged }
          : { op: "merge", item: merged },
      )
      continue
    }
    const aisle = item.aisle ?? guessAisle(options.aisles, item.name)
    const added =
      aisle === item.aisle ? item : new GroceryItem({ ...item, aisle })
    writes.set(added.idString, {
      op: "add",
      item: added,
      guessedAisle: item.aisle === null && aisle !== null,
    })
    if (target === undefined) targets.set(key, added)
  }
  return Array.from(writes.values())
}
