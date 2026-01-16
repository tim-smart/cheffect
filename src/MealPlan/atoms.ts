import { Store } from "@/livestore/atoms"
import { events, tables } from "@/livestore/schema"
import { menuDayNotesAtom, menuEntriesAtom } from "@/Menus/atoms"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

export const addMenuToMealPlanAtom = Store.runtime.fn<{
  readonly menuId: string
  readonly startDate: DateTime.Utc
}>()(
  Effect.fnUntraced(function* ({ menuId, startDate }, get) {
    const store = yield* Store
    const entries = get(menuEntriesAtom(menuId))!
    const dayNotes = get(menuDayNotesAtom(menuId)) ?? []
    const mealPlanNotes = store.query(tables.mealPlanDayNotes)
    const mealPlanNoteByDay = new Map<string, MealPlanDayNote>()

    for (const note of mealPlanNotes) {
      const key = DateTime.formatIsoDate(note.day)
      const existing = mealPlanNoteByDay.get(key)
      if (
        !existing ||
        note.updatedAt.epochMillis > existing.updatedAt.epochMillis
      ) {
        mealPlanNoteByDay.set(key, note)
      }
    }

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

    for (const note of dayNotes) {
      const day = DateTime.add(startDate, { days: note.day - 1 })
      const key = DateTime.formatIsoDate(day)
      const existing = mealPlanNoteByDay.get(key)
      if (existing) {
        if (existing.note === note.note) continue
        store.commit(
          events.mealPlanDayNoteUpdate({
            ...existing,
            note: note.note,
            updatedAt: DateTime.unsafeNow(),
          }),
        )
        continue
      }

      store.commit(
        events.mealPlanDayNoteAdd(
          MealPlanDayNote.fromForm({
            day,
            note: note.note,
          }),
        ),
      )
    }
  }),
)
