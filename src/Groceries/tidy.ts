import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import Fraction from "fraction.js"
import { dictionaryAisle } from "@/domain/GroceryAisleDictionary"
import { type GroceryAisle, GroceryItem } from "@/domain/GroceryItem"
import type { RecipeId } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"
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

const mergeRecipeIds = (
  a: GroceryItem["recipeIds"],
  b: GroceryItem["recipeIds"],
): GroceryItem["recipeIds"] => {
  if (a === null) return b
  if (b === null) return a
  // By id string, so the same recipe from two items counts once.
  const ids = new Map<string, RecipeId>()
  for (const id of [...a, ...b]) ids.set(uuidString(id), id)
  const [first, ...rest] = ids.values()
  return [first, ...rest]
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
  // Each name's item on its list, with its write once it has one.
  interface Target {
    item: GroceryItem
    write?: Planned
  }
  interface Planned {
    readonly op: "add" | "merge"
    readonly target: Target
    readonly guessedAisle: boolean
  }
  const planned: Array<Planned> = []
  const targets = new Map<string, Target>()
  for (const item of options.existing) {
    const key = listKey(item)
    if (item.completed || targets.has(key)) continue
    targets.set(key, { item })
  }
  for (const item of options.incoming) {
    const key = listKey(item)
    const target = targets.get(key)
    const quantity = target
      ? mergeQuantities(target.item.quantity, item.quantity)
      : Option.none()
    if (target && Option.isSome(quantity)) {
      target.item = new GroceryItem({
        ...target.item,
        quantity: quantity.value,
        recipeIds: mergeRecipeIds(target.item.recipeIds, item.recipeIds),
        updatedAt: options.now,
      })
      if (target.write === undefined) {
        target.write = { op: "merge", target, guessedAisle: false }
        planned.push(target.write)
      }
      continue
    }
    const aisle =
      item.aisle === null ? guessAisle(options.aisles, item.name) : null
    const added: Target = {
      item: aisle === null ? item : new GroceryItem({ ...item, aisle }),
    }
    added.write = { op: "add", target: added, guessedAisle: aisle !== null }
    planned.push(added.write)
    if (!target) targets.set(key, added)
  }
  return planned.map(({ op, target, guessedAisle }) =>
    op === "add"
      ? { op, item: target.item, guessedAisle }
      : { op, item: target.item },
  )
}
