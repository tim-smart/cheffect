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
import { canonicalKey, canonicalName, type IngredientAliases } from "./aliases"
import { type IngredientAisles, learnedAisle } from "./Repo"
import type { GroceryItemWrite } from "./runtime"

// The cleanup every add gets, without AI: an item that's already on its list
// merges into it instead of making a second line where that's safe, and an
// item without an aisle gets a likely one.

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

// The writes that add `incoming` given what's on the lists now.
//
// An incoming item takes its canonical name, and names match by canonical
// name, so an item already on a list under an alias still counts as the
// same ingredient.
//
// An item merges into one already on its list under the same name, not
// checked off, only when neither has a quantity: the merge then changes no
// quantity, and writes only its recipes, so a check or a quantity set
// meanwhile on another device stands. Counts are summed only between items
// this batch adds, which nothing else can have written yet. A sum written
// into an existing item would replace one written concurrently elsewhere, so
// those stay separate lines. The rest are added, with a guessed aisle when
// they have none.
export const planGroceryAdds = (options: {
  readonly existing: ReadonlyArray<GroceryItem>
  readonly aisles: IngredientAisles
  readonly aliases: IngredientAliases
  readonly incoming: ReadonlyArray<GroceryItem>
  readonly now: DateTime.Utc
}): Array<GroceryItemWrite> => {
  // The items each name on each list can merge into: what's there now, then
  // what this batch adds under the name.
  const targets = new Map<string, Array<GroceryItem>>()
  const targetsOf = (item: GroceryItem) => {
    const key = JSON.stringify([
      item.list,
      canonicalKey(options.aliases, item.name),
    ])
    let list = targets.get(key)
    if (list === undefined) {
      list = []
      targets.set(key, list)
    }
    return list
  }
  for (const item of options.existing) {
    if (!item.completed) targetsOf(item).push(item)
  }
  // By the item written, in the order first written. A later merge into the
  // same item replaces its write.
  const writes = new Map<string, GroceryItemWrite>()
  // The quantity `item` leaves on `target` if it merges there. An item this
  // batch adds takes any sum, since nothing else has written it yet. An item
  // already on the list takes only nothing onto nothing: a sum written there
  // would replace one written meanwhile elsewhere.
  const mergeInto = (target: GroceryItem, item: GroceryItem) => {
    const quantity = mergeQuantities(target.quantity, item.quantity)
    return writes.get(target.idString)?.op === "add"
      ? quantity
      : Option.filter(quantity, (sum) => sum === null)
  }
  for (const incoming of options.incoming) {
    const name = canonicalName(options.aliases, incoming.name)
    const item =
      name === incoming.name ? incoming : new GroceryItem({ ...incoming, name })
    const candidates = targetsOf(item)
    const index = candidates.findIndex((target) =>
      Option.isSome(mergeInto(target, item)),
    )
    if (index !== -1) {
      const target = candidates[index]
      const merged = new GroceryItem({
        ...target,
        quantity: Option.getOrNull(mergeInto(target, item)),
        recipeIds: unionRecipeIds(target.recipeIds, item.recipeIds),
        updatedAt: options.now,
      })
      candidates[index] = merged
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
    candidates.push(added)
  }
  return Array.from(writes.values())
}
