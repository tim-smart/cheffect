import { seedRecipes } from "./seedRecipes"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Atom } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as Schema from "effect/Schema"

const RecipeCount = Schema.Array(
  Schema.Struct({
    count: Schema.Number,
  }),
)

const recipeCount$ = queryDb(
  {
    query: sql`SELECT COUNT(*) as count FROM recipes WHERE deletedAt IS NULL`,
    schema: RecipeCount,
  },
  {
    label: "devRecipeSeedCount",
    map: (rows) => rows[0]?.count ?? 0,
  },
)

export const seedDevRecipesAtom = Atom.make((get) => {
  const store = get(Store.storeUnsafe)
  if (!store) return
  const count = store.query(recipeCount$)
  if (count > 0) return
  for (const recipe of seedRecipes) {
    store.commit(events.recipeCreated(recipe.asRecipe()))
  }
})
