import { seedGroceryItems } from "./seedGroceryItems"
import { seedRecipes } from "./seedRecipes"
import { GroceryItem } from "@/domain/GroceryItem"
import { Menu } from "@/domain/Menu"
import { MenuEntry } from "@/domain/MenuEntry"
import { Recipe } from "@/domain/Recipe"
import { mealPlanWeekStart } from "@/Settings"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Atom, Result } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const CountSchema = Schema.Array(
  Schema.Struct({
    count: Schema.Number,
  }),
)

const recipeCount$ = queryDb(
  {
    query: sql`SELECT COUNT(*) as count FROM recipes WHERE deletedAt IS NULL`,
    schema: CountSchema,
  },
  {
    label: "devRecipeSeedCount",
    map: (rows) => rows[0]?.count ?? 0,
  },
)

const groceryCount$ = queryDb(
  {
    query: sql`SELECT COUNT(*) as count FROM grocery_items`,
    schema: CountSchema,
  },
  {
    label: "devGrocerySeedCount",
    map: (rows) => rows[0]?.count ?? 0,
  },
)

const menuCount$ = queryDb(
  {
    query: sql`SELECT COUNT(*) as count FROM menus`,
    schema: CountSchema,
  },
  {
    label: "devMenuSeedCount",
    map: (rows) => rows[0]?.count ?? 0,
  },
)

const mealPlanCount$ = queryDb(
  {
    query: sql`SELECT COUNT(*) as count FROM meal_plan`,
    schema: CountSchema,
  },
  {
    label: "devMealPlanSeedCount",
    map: (rows) => rows[0]?.count ?? 0,
  },
)

const seedRecipes$ = queryDb(
  {
    query: sql`
      SELECT *
      FROM recipes
      WHERE deletedAt IS NULL
      ORDER BY createdAt DESC`,
    schema: Recipe.array,
  },
  {
    label: "devSeedRecipes",
  },
)

export const seedDevRecipesAtom = Atom.make((get) => {
  const store = get(Store.storeUnsafe)
  if (!store) return
  const recipeCount = store.query(recipeCount$)
  const groceryCount = store.query(groceryCount$)
  const menuCount = store.query(menuCount$)
  const mealPlanCount = store.query(mealPlanCount$)

  let availableRecipes: ReadonlyArray<Recipe> = []
  if (recipeCount === 0) {
    availableRecipes = seedRecipes.map((recipe) => recipe.asRecipe())
    for (const recipe of availableRecipes) {
      store.commit(events.recipeCreated(recipe))
    }
  } else {
    availableRecipes = store.query(seedRecipes$)
  }

  if (groceryCount === 0) {
    for (const item of seedGroceryItems) {
      const groceryItem = GroceryItem.fromForm(
        {
          name: item.name,
          quantity: item.quantity,
          aisle: item.aisle,
        },
        null,
      )
      store.commit(events.groceryItemAdded(groceryItem))
    }
  }

  if (menuCount === 0 && availableRecipes.length > 0) {
    const menu = Menu.fromForm({ name: "Weeknight Rotation" })
    store.commit(events.menuAdd(menu))
    const menuDays = [1, 2, 3, 4, 5]
    for (const [index, day] of menuDays.entries()) {
      const recipe = availableRecipes[index % availableRecipes.length]
      store.commit(
        events.menuEntryAdd(
          MenuEntry.fromForm({
            menuId: menu.id,
            recipeId: recipe.id,
            day,
          }),
        ),
      )
    }
  }

  if (mealPlanCount === 0 && availableRecipes.length > 0) {
    const weekStartsOn = get(mealPlanWeekStart.atom).pipe(
      Result.value,
      Option.flatten,
      Option.getOrElse(() => 0 as const),
    )
    const today = new Date().getDay()
    const startOfWeek = DateTime.unsafeNow().pipe(
      DateTime.setZone(DateTime.zoneMakeLocal()),
      DateTime.startOf("week"),
      DateTime.removeTime,
    )
    const weekStart = DateTime.add(startOfWeek, {
      days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
    })
    const offsets = [0, 2, 4, 6]
    for (const [index, offset] of offsets.entries()) {
      const recipe = availableRecipes[index % availableRecipes.length]
      store.commit(
        events.mealPlanAdd({
          id: crypto.randomUUID(),
          day: DateTime.add(weekStart, { days: offset }),
          recipeId: recipe.id,
        }),
      )
    }
  }
})
