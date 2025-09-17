import { GroceryItem } from "@/domain/GroceryItem"
import { allGroceryItemsAtom } from "@/livestore/queries"
import { Atom } from "@effect-atom/atom-react"

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
