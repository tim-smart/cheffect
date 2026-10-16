import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import type { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { writeEvent } from "@/EventLog"
import { uuidString } from "@/lib/Id"
import { recipesRuntime } from "@/Recipes/runtime"
import { MealPlanRepo, type PlannedEntry } from "./Repo"

// The repo shares the recipes runtime, so the join reads the same recipes
// snapshot and handler writes reload both.
export const mealPlanRuntime = Atom.runtime((get) =>
  MealPlanRepo.layer.pipe(Layer.provideMerge(get(recipesRuntime.layer))),
).pipe(Atom.keepAlive)

// Writes entries and notes as new add entries. Ones that already exist are
// left alone, so importing the same file twice changes nothing. A note add
// would merge as the newest write, so existing notes are skipped here rather
// than reverted to the file's text.
// A device that has not synced the original row can still emit another Add.
// With hard deletes, this is not a general delete-wins fix for snapshot imports.
export const importMealPlanAtom = mealPlanRuntime.fn<{
  readonly entries: ReadonlyArray<PlannedEntry>
  readonly notes: ReadonlyArray<MealPlanDayNote>
}>()(
  Effect.fnUntraced(function* ({ entries, notes }) {
    const existingEntries = new Set(
      (yield* MealPlanRepo.use((repo) => repo.entries)).map((entry) =>
        uuidString(entry.id),
      ),
    )
    const existing = new Set(
      (yield* MealPlanRepo.use((repo) => repo.notes)).map(
        (note) => note.idString,
      ),
    )
    for (const entry of entries) {
      if (existingEntries.has(uuidString(entry.id))) continue
      yield* writeEvent({ event: "MealPlanAdd", payload: entry })
    }
    for (const note of notes) {
      if (existing.has(note.idString)) continue
      yield* writeEvent({ event: "MealPlanDayNoteAdd", payload: note })
    }
  }),
)
