import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { menuEntriesAtom } from "@/Menus/atoms"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

export const addMenuToMealPlanAtom = Store.runtime.fn<{
  readonly menuId: string
  readonly startDate: DateTime.Utc
}>()(
  Effect.fnUntraced(function* ({ menuId, startDate }, get) {
    const store = yield* Store
    const entries = get(menuEntriesAtom(menuId))!
    for (const entry of entries) {
      const day = DateTime.add(startDate, { days: entry.day - 1 })
      store.commit(
        events.mealPlanAdd({
          id: crypto.randomUUID(),
          day,
          recipeId: entry.recipe.id,
        }),
      )
    }
  }),
)
