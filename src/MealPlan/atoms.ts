import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import { writeEvent } from "@/EventLog"
import { generateUuidBytes } from "@/lib/Id"
import { menuByIdAtom } from "@/Menus/atoms"
import { RecipeRepo } from "@/Recipes/Repo"
import { mealPlanWeekStart } from "@/Settings"
import { latestNoteByDay, MealPlanRepo, weekEntries, weekNotes } from "./Repo"
import { mealPlanRuntime } from "./runtime"
import {
  MealPlanEntryEvent,
  MealPlanDayNoteEvent,
  mealPlanDayNoteUpdate,
} from "@/MealPlan/Events"

// The week being viewed

export const mealPlanWeekAtom = Atom.make(
  DateTime.nowUnsafe().pipe(
    DateTime.setZone(DateTime.zoneMakeLocal()),
    DateTime.startOf("week"),
    DateTime.removeTime,
  ),
).pipe(Atom.keepAlive)

export const mealPlanWeekAdjustedAtom = Atom.make((get) => {
  const today = new Date().getDay()
  const selectedWeek = get(mealPlanWeekAtom)
  const weekStartsOn = get(mealPlanWeekStart.atom).pipe(
    AsyncResult.value,
    Option.flatten,
    Option.getOrElse(() => 0 as const),
  )
  return DateTime.add(selectedWeek, {
    days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
  })
})

// Reads

const entriesAtom = mealPlanRuntime
  .atom(MealPlanRepo.useSync((_) => _.entriesStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const notesAtom = mealPlanRuntime
  .atom(MealPlanRepo.useSync((_) => _.notesStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const recipesAtom = mealPlanRuntime
  .atom(RecipeRepo.useSync((_) => _.stream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

export const mealPlanEntriesAtom = Atom.make((get) => {
  const startDay = get(mealPlanWeekAdjustedAtom)
  return AsyncResult.all({
    entries: get(entriesAtom),
    recipes: get(recipesAtom),
  }).pipe(
    AsyncResult.map(({ entries, recipes }) =>
      weekEntries(entries, recipes, startDay),
    ),
  )
})

export const mealPlanDayNotesAtom = Atom.make((get) => {
  const startDay = get(mealPlanWeekAdjustedAtom)
  return AsyncResult.map(get(notesAtom), (notes) => weekNotes(notes, startDay))
})

// Writes

export const addMenuToMealPlanAtom = mealPlanRuntime.fn<{
  readonly menuId: string
  readonly startDate: DateTime.Utc
}>()(
  Effect.fnUntraced(function* ({ menuId, startDate }, get) {
    // Only what the menu shows: entries and notes past its last day stay off
    // the plan.
    const menu = yield* get.result(menuByIdAtom(menuId))
    if (Option.isNone(menu)) return
    const { entries, notes: dayNotes } = menu.value
    const mealPlanNoteByDay = latestNoteByDay(
      yield* MealPlanRepo.use((repo) => repo.notes),
    )

    for (const entry of entries) {
      yield* writeEvent({
        event: MealPlanEntryEvent.tag,
        payload: MealPlanEntryEvent.set({
          id: MealPlanEntryId.make(generateUuidBytes()),
          day: DateTime.add(startDate, { days: entry.day - 1 }),
          recipeId: entry.recipe.id,
        }),
      })
    }

    for (const note of dayNotes) {
      const day = DateTime.add(startDate, { days: note.day - 1 })
      const existing = mealPlanNoteByDay.get(DateTime.formatIsoDate(day))
      if (existing) {
        if (existing.note === note.note) continue
        yield* writeEvent({
          event: MealPlanDayNoteEvent.tag,
          payload: mealPlanDayNoteUpdate({
            ...existing,
            note: note.note,
            updatedAt: yield* DateTime.now,
          }),
        })
        continue
      }

      yield* writeEvent({
        event: MealPlanDayNoteEvent.tag,
        payload: MealPlanDayNoteEvent.set(
          MealPlanDayNote.fromForm({ day, note: note.note }),
        ),
      })
    }
  }),
)
