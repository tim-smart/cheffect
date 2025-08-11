import { queryDb, sql } from "@livestore/livestore"
import { tables } from "./schema"
import { Recipe } from "@/domain/Recipe"
import { Store } from "./atoms"

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
