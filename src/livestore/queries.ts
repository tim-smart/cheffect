import { queryDb, Schema, sql } from "@livestore/livestore"
import { tables } from "./schema"

export const allRecipes$ = queryDb({
  query: sql`SELECT * FROM recipes WHERE deletedAt IS NULL ORDER BY title ASC`,
  schema: Schema.Array(tables.recipes.rowSchema),
})
