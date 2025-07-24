import { queryDb } from "@livestore/livestore"
import { tables } from "./schema"

export const searchState$ = queryDb(tables.searchState.get())

export const allRecipes$ = queryDb(
  (get) => {
    const { query } = get(searchState$)
    const trimmedQuery = query.trim()
    if (trimmedQuery === "") {
      return tables.recipes
    }
    return tables.recipes.where("title", "LIKE", `%${trimmedQuery}%`)
  },
  { label: "allRecipes" },
)
