import * as DateTime from "effect/DateTime"
import {
  GroceryItem,
  type GroceryListChanges,
  normalizeIngredientName,
  unionRecipeIds,
} from "@/domain/GroceryItem"

// What the AI beautify pass changes, from the items it was sent and the
// changes it returned. An item it doesn't mention stays as it is: only a
// merge removes anything. Merges apply first, then renames, then aisles for
// items that had none; a change to an item already merged away is dropped.
//
// Every rename and merge is also a lesson for the alias table: the name the
// item had, and the name it ended up under. A lesson whose names only differ
// in case or spacing teaches nothing.
export const beautifyChanges = (
  items: Iterable<GroceryItem>,
  changes: typeof GroceryListChanges.Type,
  now: DateTime.Utc,
) => {
  const previous = new Map<string, GroceryItem>()
  for (const item of items) previous.set(item.idString, item)
  const changed = new Map<string, GroceryItem>()
  // Each removed item's id, with the id of the item it merged into.
  const mergedInto = new Map<string, string>()
  const current = (id: string) => {
    const key = id.toLowerCase()
    if (mergedInto.has(key)) return undefined
    return changed.get(key) ?? previous.get(key)
  }
  const change = (item: GroceryItem, fields: Partial<GroceryItem>) =>
    changed.set(
      item.idString,
      new GroceryItem({ ...item, ...fields, updatedAt: now }),
    )

  for (const merge of changes.merges) {
    const target = current(merge.targetId)
    if (target === undefined) continue
    const sources = merge.sourceIds.flatMap((id) => {
      const source = current(id)
      return source === undefined || source.idString === target.idString
        ? []
        : [source]
    })
    for (const source of sources) {
      mergedInto.set(source.idString, target.idString)
    }
    change(target, {
      name: merge.name,
      quantity: merge.quantity,
      recipeIds: unionRecipeIds(
        target.recipeIds,
        ...sources.map((source) => source.recipeIds),
      ),
    })
  }
  for (const update of changes.updates) {
    const item = current(update.id)
    if (item !== undefined) {
      change(item, { name: update.name, quantity: update.quantity })
    }
  }
  for (const { id, aisle } of changes.aisles) {
    const item = current(id)
    if (item !== undefined && item.aisle === null) change(item, { aisle })
  }

  // The item a removed one ended up in, through later merges.
  const survivor = (id: string): GroceryItem => {
    const into = mergedInto.get(id)
    return into === undefined
      ? (changed.get(id) ?? previous.get(id)!)
      : survivor(into)
  }
  const lessons = new Map<string, { name: string; canonical: string }>()
  const learn = (name: string, canonical: string) => {
    const key = normalizeIngredientName(name)
    if (key === normalizeIngredientName(canonical) || lessons.has(key)) return
    lessons.set(key, { name, canonical })
  }
  const updated: Array<{ previous: GroceryItem; item: GroceryItem }> = []
  for (const [id, item] of changed) {
    if (mergedInto.has(id)) continue
    const before = previous.get(id)!
    updated.push({ previous: before, item })
    learn(before.name, item.name)
  }
  const removed: Array<GroceryItem> = []
  for (const id of mergedInto.keys()) {
    const item = previous.get(id)!
    removed.push(item)
    learn(item.name, survivor(id).name)
  }

  return { updated, removed, lessons: Array.from(lessons.values()) } as const
}
