import { seedGroceryItems } from "./seedGroceryItems"
import { seedPadding, seedRecipes } from "./seedRecipes"
import { GroceryItem } from "@/domain/GroceryItem"
import { Menu } from "@/domain/Menu"
import { MenuEntry } from "@/domain/MenuEntry"
import { mealPlanWeekStart } from "@/Settings"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Effect from "effect/Effect"
import { syncEnabledAtom, writeEvent } from "@/EventLog"
import { RecipeRepo } from "@/Recipes/Repo"
import { recipesRuntime } from "@/Recipes/runtime"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import { generateUuidBytes } from "@/lib/Id"
import { RecipeEvent } from "@/Recipes/Events"
import { MealPlanRepo } from "@/MealPlan/Repo"
import { mealPlanRuntime } from "@/MealPlan/runtime"
import { MenuRepo } from "@/Menus/Repo"
import { menusRuntime } from "@/Menus/runtime"
import { GroceryRepo } from "@/Groceries/Repo"
import { addGroceryItems, groceriesRuntime } from "@/Groceries/runtime"
import { MealPlanEntryEvent } from "@/MealPlan/Events"
import { MenuEvent, MenuEntryEvent } from "@/Menus/Events"

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
    const recipes = [...seedRecipes, ...seedPadding()].map((recipe) =>
      recipe.asRecipe(),
    )
    for (const recipe of recipes) {
      yield* writeEvent(RecipeEvent.set(recipe))
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
      yield* writeEvent(
        MealPlanEntryEvent.set({
          id: MealPlanEntryId.make(generateUuidBytes()),
          day: DateTime.add(weekStart, { days: offset }),
          recipeId: recipe.id,
        }),
      )
    }
  }),
)

// Menus read through the repo and written through the EventLog: a week with
// five of the seeded recipes over its first five days, and a fortnight with
// twenty, some days holding two and the weekends free.
const seededMenusAtom = menusRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const recipes = yield* get.result(seededRecipesAtom)
    const repo = yield* MenuRepo
    if (recipes.length === 0 || (yield* repo.all).length > 0) return
    const menus = [
      { name: "Weeknight Rotation", days: 7, entryDays: [1, 2, 3, 4, 5] },
      {
        name: "Fortnightly plan",
        days: 14,
        entryDays: [
          1, 1, 2, 2, 3, 4, 4, 5, 6, 6, 8, 8, 9, 9, 10, 11, 12, 12, 13, 13,
        ],
      },
    ]
    for (const { name, days, entryDays } of menus) {
      const menu = new Menu({ ...Menu.fromForm({ name }), days })
      yield* writeEvent(MenuEvent.set(menu))
      for (const [index, day] of entryDays.entries()) {
        const recipe = recipes[index % recipes.length]
        yield* writeEvent(
          MenuEntryEvent.set(
            MenuEntry.fromForm({
              menuId: menu.id,
              recipeId: recipe.id,
              day,
            }),
          ),
        )
      }
    }
  }),
)

// Grocery items on the default list, read through the repo and written
// through the EventLog, once the recipes are seeded.
const seededGroceriesAtom = groceriesRuntime.atom(
  Effect.fnUntraced(function* (get) {
    yield* get.result(seededRecipesAtom)
    const repo = yield* GroceryRepo
    if ((yield* repo.items).length > 0) return
    yield* addGroceryItems(
      seedGroceryItems.map((item) => GroceryItem.fromForm(item, null)),
    )
  }),
)

// A device with sync on is filling up from its collection, so seeding it
// would upload the seed into that collection.
export const seedDevRecipesAtom = Atom.make((get) => {
  if (get(syncEnabledAtom)) return
  get(seededMealPlanAtom)
  get(seededMenusAtom)
  get(seededGroceriesAtom)
})
