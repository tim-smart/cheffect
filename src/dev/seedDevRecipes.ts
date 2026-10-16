import { seedGroceryItems } from "./seedGroceryItems"
import { seedRecipes } from "./seedRecipes"
import { GroceryItem } from "@/domain/GroceryItem"
import { Menu } from "@/domain/Menu"
import { MenuEntry } from "@/domain/MenuEntry"
import { mealPlanWeekStart } from "@/Settings"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { queryDb, sql } from "@livestore/livestore"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { writeEvent } from "@/EventLog"
import { RecipeRepo } from "@/Recipes/Repo"
import { recipesRuntime } from "@/Recipes/runtime"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import { generateUuidBytes } from "@/lib/Id"
import { MealPlanRepo } from "@/MealPlan/Repo"
import { mealPlanRuntime } from "@/MealPlan/runtime"
import { MenuRepo } from "@/Menus/Repo"
import { menusRuntime } from "@/Menus/runtime"

const CountSchema = Schema.Array(
  Schema.Struct({
    count: Schema.Number,
  }),
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

// Recipes are read through the repo and written through the EventLog. The
// result is the recipes the other seeds reference.
const seededRecipesAtom = recipesRuntime.atom(
  Effect.gen(function* () {
    const repo = yield* RecipeRepo
    const existing = yield* repo.live
    if (existing.length > 0) {
      return existing.toSorted(
        (a, b) => b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds,
      )
    }
    const recipes = seedRecipes.map((recipe) => recipe.asRecipe())
    for (const recipe of recipes) {
      yield* writeEvent({ event: "RecipeCreated", payload: recipe })
    }
    return recipes
  }),
)

// The meal plan is read through the repo and written through the EventLog:
// four of the seeded recipes spread over the current week.
const seededMealPlanAtom = mealPlanRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const recipes = yield* get.result(seededRecipesAtom)
    const repo = yield* MealPlanRepo
    if (recipes.length === 0 || (yield* repo.entries).length > 0) return
    const weekStartsOn = get(mealPlanWeekStart.atom).pipe(
      AsyncResult.value,
      Option.flatten,
      Option.getOrElse(() => 0 as const),
    )
    const today = new Date().getDay()
    const startOfWeek = DateTime.nowUnsafe().pipe(
      DateTime.setZone(DateTime.zoneMakeLocal()),
      DateTime.startOf("week"),
      DateTime.removeTime,
    )
    const weekStart = DateTime.add(startOfWeek, {
      days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
    })
    const offsets = [0, 2, 4, 6]
    for (const [index, offset] of offsets.entries()) {
      const recipe = recipes[index % recipes.length]
      yield* writeEvent({
        event: "MealPlanAdd",
        payload: {
          id: MealPlanEntryId.make(generateUuidBytes()),
          day: DateTime.add(weekStart, { days: offset }),
          recipeId: recipe.id,
        },
      })
    }
  }),
)

// A menu read through the repo and written through the EventLog: five of the
// seeded recipes over its first five days.
const seededMenusAtom = menusRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const recipes = yield* get.result(seededRecipesAtom)
    const repo = yield* MenuRepo
    if (recipes.length === 0 || (yield* repo.all).length > 0) return
    const menu = Menu.fromForm({ name: "Weeknight Rotation" })
    yield* writeEvent({ event: "MenuAdd", payload: menu })
    const menuDays = [1, 2, 3, 4, 5]
    for (const [index, day] of menuDays.entries()) {
      const recipe = recipes[index % recipes.length]
      yield* writeEvent({
        event: "MenuEntryAdd",
        payload: MenuEntry.fromForm({
          menuId: menu.id,
          recipeId: recipe.id,
          day,
        }),
      })
    }
  }),
)

export const seedDevRecipesAtom = Atom.make((get) => {
  get(seededMealPlanAtom)
  get(seededMenusAtom)
  const store = get(Store.storeUnsafe)
  if (!store) return
  const seeded = get(seededRecipesAtom)
  if (!AsyncResult.isSuccess(seeded)) return
  const groceryCount = store.query(groceryCount$)

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
})
