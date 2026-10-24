import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import { GroceryItem, type GroceryItemList } from "@/domain/GroceryItem"
import type { RecipeId } from "@/domain/Recipe"
import { uuidString } from "@/lib/Id"

// What the AI beautify pass changes, from the items it was sent and its
// response. An item comes back renamed or requantified, or is removed because
// it was merged into another. An item the response leaves out stays as it is:
// only a merge removes anything.
export const beautifyChanges = (
  items: Iterable<GroceryItem>,
  response: typeof GroceryItemList.Type,
  now: DateTime.Utc,
) => {
  const leftoverItems = new Map<string, GroceryItem>()
  for (const item of items) leftoverItems.set(item.idString, item)

  const merges = new Map<string, string>()
  const updated: Array<GroceryItem> = []
  for (const item of response.items) {
    const itemId = uuidString(item.id)
    const prev = leftoverItems.get(itemId)
    if (!prev) continue
    // By id string, so the same recipe from two items counts once.
    const recipeIds = new Map<string, RecipeId>(
      prev.recipeIds?.map((id) => [uuidString(id), id]),
    )
    leftoverItems.delete(itemId)
    for (const mergedId of item.mergedIds) {
      const mergedItem = leftoverItems.get(mergedId.toLowerCase())
      if (!mergedItem) continue
      merges.set(mergedItem.idString, itemId)
      mergedItem.recipeIds?.forEach((id) => recipeIds.set(uuidString(id), id))
    }
    const recipeIdsArray = Array.fromIterable(recipeIds.values())
    updated.push(
      new GroceryItem({
        ...prev,
        ...item,
        recipeIds: Array.isArrayNonEmpty(recipeIdsArray)
          ? recipeIdsArray
          : null,
        updatedAt: now,
      }),
    )
  }

  const removed = Array.filter(
    Array.fromIterable(leftoverItems.values()),
    (item) => merges.has(item.idString),
  )

  return { updated, removed, merges } as const
}
