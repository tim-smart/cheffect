import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import type { Recipe } from "@/domain/Recipe"
import { eventLogAtom, writeEvent } from "@/EventLog"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import { RecipeRepo } from "./Repo"

// The repos share the EventLog runtime's query builder and Reactivity, so
// handler writes reload their snapshots. Kept apart from `atoms.ts` so modules
// that atoms.ts imports (Settings) can read recipes without an import cycle.
export const recipesRuntime = Atom.runtime((get) =>
  Layer.mergeAll(RecipeRepo.layer, RecipeExtractJobRepo.layer).pipe(
    Layer.provideMerge(get(eventLogAtom.layer)),
  ),
).pipe(Atom.keepAlive)

// Every live recipe, read when called rather than cached in an atom.
export const liveRecipesAtom = recipesRuntime.fn<void>()(() =>
  RecipeRepo.use((repo) => repo.live),
)

// Writes recipes as new `RecipeCreated` entries. A recipe that already exists
// is left alone, so importing the same file twice changes nothing.
export const importRecipesAtom = recipesRuntime.fn<ReadonlyArray<Recipe>>()(
  Effect.fnUntraced(function* (recipes) {
    for (const recipe of recipes) {
      yield* writeEvent({ event: "RecipeCreated", payload: recipe })
    }
  }),
)
