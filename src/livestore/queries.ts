import { queryDb, sql } from "@livestore/livestore"
import { tables } from "./schema"
import { Recipe } from "@/domain/Recipe"
import { Store } from "./atoms"
import { Atom } from "@effect-atom/atom-react"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"

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
