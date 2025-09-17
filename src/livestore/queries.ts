import { queryDb, sql } from "@livestore/livestore"
import { tables } from "./schema"
import { Recipe } from "@/domain/Recipe"
import { Store } from "./atoms"
import { Atom } from "@effect-atom/atom-react"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { GroceryItem } from "@/domain/GroceryItem"

export const searchState$ = queryDb(tables.searchState.get())
export const searchStateAtom = Store.makeQuery(searchState$)

export const allRecipesAtom = Store.makeQuery(
  queryDb(
    (get) => {
      const { query } = get(searchState$)
      const trimmedQuery = query.trim()
      if (trimmedQuery === "") {
        return {
          query: sql`SELECT * FROM recipes ORDER BY createdAt DESC`,
          schema: Recipe.array,
        }
      }
      return {
        query: sql`SELECT * FROM recipes WHERE title LIKE ? ORDER BY createdAt DESC`,
        schema: Recipe.array,
        bindValues: [`%${trimmedQuery}%`],
      }
    },
    { label: "allRecipes" },
  ),
)

export const recipeByIdAtom = Atom.family((id: string) => {
  const result = Store.makeQuery(
    queryDb(
      {
        query: sql`SELECT * FROM recipes WHERE id = ?`,
        bindValues: [id],
        schema: Recipe.array,
      },
      {
        map: Array.head,
      },
    ),
  )

  return Atom.make((get) => get.result(result).pipe(Effect.flatten))
})

export const allGroceryItemsAtom = Store.makeQuery(
  queryDb(
    {
      query: sql`SELECT * FROM grocery_items ORDER BY aisle, name DESC`,
      schema: GroceryItem.array,
    },
    {
      map: (items) => {
        const aisles = new Map<string, Array.NonEmptyArray<GroceryItem>>()
        for (const item of items) {
          const aisle = item.aisle ?? "Other"
          const existing = aisles.get(aisle)
          if (existing) {
            existing.push(item)
          } else {
            aisles.set(aisle, [item])
          }
        }
        if (aisles.has("Other")) {
          const other = aisles.get("Other")!
          aisles.delete("Other")
          aisles.set("Other", other)
        }
        return aisles
      },
    },
  ),
)
