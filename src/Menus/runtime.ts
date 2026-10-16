import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import { recipesRuntime } from "@/Recipes/runtime"
import { MenuRepo } from "./Repo"

// The repo shares the recipes runtime, so the join reads the same recipes
// snapshot and handler writes reload both.
export const menusRuntime = Atom.runtime((get) =>
  MenuRepo.layer.pipe(Layer.provideMerge(get(recipesRuntime.layer))),
).pipe(Atom.keepAlive)
