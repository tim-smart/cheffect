import * as DateTime from "effect/DateTime"
import {
  GroceryItem,
  type GroceryItemList,
  unionRecipeIds,
} from "@/domain/GroceryItem"
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

  const mergedIds = new Set<string>()
  const updated: Array<GroceryItem> = []
  for (const item of response.items) {
    const itemId = uuidString(item.id)
    const prev = leftoverItems.get(itemId)
    if (!prev) continue
    leftoverItems.delete(itemId)
    const mergedItems: Array<GroceryItem> = []
    for (const mergedId of item.mergedIds) {
      const mergedItem = leftoverItems.get(mergedId.toLowerCase())
      if (!mergedItem) continue
      mergedIds.add(mergedItem.idString)
      mergedItems.push(mergedItem)
    }
    updated.push(
      new GroceryItem({
        ...prev,
        ...item,
        recipeIds: unionRecipeIds(
          prev.recipeIds,
          ...mergedItems.map((merged) => merged.recipeIds),
        ),
        updatedAt: now,
      }),
    )
  }

  const removed = Array.from(leftoverItems.values()).filter((item) =>
    mergedIds.has(item.idString),
  )

  return { updated, removed } as const
}
