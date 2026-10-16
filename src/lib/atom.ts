import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"

// Lives here rather than in src/atoms.ts so modules that only need
// localStorage-backed atoms (and their node tests) don't pull in the UI.
export const kvsRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

export const makeResultOptionAtom = <R, W>(source: Atom.Writable<R, W>) =>
  Atom.writable(
    (get) => AsyncResult.success(Option.some(get(source))),
    (ctx, newValue: Option.Option<W>) => {
      if (Option.isSome(newValue)) {
        ctx.set(source, newValue.value)
      }
    },
  )
