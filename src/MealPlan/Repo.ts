import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntry } from "@/domain/MealPlanEntry"
import { uuidString } from "@/lib/Id"
import { stripLww } from "@/lib/Lww"
import { makeSnapshot } from "@/lib/Snapshot"
import { compareText } from "@/lib/text"
import { RecipeRepo, type Recipes } from "@/Recipes/Repo"
import type { MealPlanDayNoteRow, MealPlanRow } from "./Table"

// Reads
//
// Every read is a pure function over the table snapshots. Entries are joined
// with the recipes snapshot: an entry whose recipe is missing (not synced yet,
// or never) is hidden, and one whose recipe is soft-deleted still shows.

export type PlannedEntry = Omit<MealPlanRow, "_lww">

const decodeEntries = (
  rows: ReadonlyArray<MealPlanRow>,
): ReadonlyArray<PlannedEntry> => rows.map(stripLww)

const decodeNotes = (
  rows: ReadonlyArray<MealPlanDayNoteRow>,
): ReadonlyArray<MealPlanDayNote> =>
  rows.map((row) => new MealPlanDayNote(stripLww(row)))

// The ISO dates of the seven days from `startDay`.
export const weekDays = (startDay: DateTime.Utc): ReadonlySet<string> => {
  const days = new Set<string>()
  for (let i = 0; i < 7; i++) {
    days.add(DateTime.formatIsoDate(DateTime.add(startDay, { days: i })))
  }
  return days
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// The week's entries with their recipes, by day and then recipe title.
export const weekEntries = (
  entries: ReadonlyArray<PlannedEntry>,
  recipes: Recipes,
  startDay: DateTime.Utc,
): ReadonlyArray<MealPlanEntry> => {
  const days = weekDays(startDay)
  const out: Array<MealPlanEntry> = []
  for (const entry of entries) {
    if (!days.has(DateTime.formatIsoDate(entry.day))) continue
    const recipe = recipes.byId.get(uuidString(entry.recipeId))
    if (recipe === undefined) continue
    out.push(new MealPlanEntry({ id: entry.id, recipe, day: entry.day }))
  }
  return out.sort(
    (a, b) =>
      a.day.epochMilliseconds - b.day.epochMilliseconds ||
      compareText(a.recipe.title, b.recipe.title) ||
      compareIds(a.idString, b.idString),
  )
}

// The week's day notes, by day and then newest first.
export const weekNotes = (
  notes: ReadonlyArray<MealPlanDayNote>,
  startDay: DateTime.Utc,
): ReadonlyArray<MealPlanDayNote> => {
  const days = weekDays(startDay)
  return notes
    .filter((note) => days.has(DateTime.formatIsoDate(note.day)))
    .sort(
      (a, b) =>
        a.day.epochMilliseconds - b.day.epochMilliseconds ||
        b.updatedAt.epochMilliseconds - a.updatedAt.epochMilliseconds ||
        compareIds(a.idString, b.idString),
    )
}

// Two devices can each add a note for the same day; the most recently updated
// one is the day's note.
export const latestNoteByDay = (
  notes: Iterable<MealPlanDayNote>,
): ReadonlyMap<string, MealPlanDayNote> => {
  const byDay = new Map<string, MealPlanDayNote>()
  for (const note of notes) {
    const key = DateTime.formatIsoDate(note.day)
    const existing = byDay.get(key)
    if (
      existing === undefined ||
      note.updatedAt.epochMilliseconds > existing.updatedAt.epochMilliseconds ||
      (note.updatedAt.epochMilliseconds ===
        existing.updatedAt.epochMilliseconds &&
        note.idString > existing.idString)
    ) {
      byDay.set(key, note)
    }
  }
  return byDay
}

export class MealPlanRepo extends Context.Service<MealPlanRepo>()(
  "cheffect/MealPlan/Repo/MealPlanRepo",
  {
    make: Effect.gen(function* () {
      const recipes = yield* RecipeRepo
      const entries = yield* makeSnapshot("mealPlan")
      const notes = yield* makeSnapshot("mealPlanDayNotes")

      const currentEntries = entries.current.pipe(Effect.map(decodeEntries))
      const currentNotes = notes.current.pipe(Effect.map(decodeNotes))

      return {
        entriesStream: entries.stream.pipe(Stream.map(decodeEntries)),
        notesStream: notes.stream.pipe(Stream.map(decodeNotes)),
        // Every entry and note, unjoined: for export and the dev seed.
        entries: currentEntries,
        notes: currentNotes,
        week: (startDay: DateTime.Utc) =>
          Effect.all({
            entries: currentEntries,
            notes: currentNotes,
            recipes: recipes.current,
          }).pipe(
            Effect.map(({ entries, notes, recipes }) => ({
              entries: weekEntries(entries, recipes, startDay),
              notes: weekNotes(notes, startDay),
            })),
          ),
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
