import * as Atom from "effect/reactivity/Atom"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"

// Lives here rather than in src/atoms.ts so modules that only need
// localStorage-backed atoms (and their node tests) don't pull in the UI.
export const kvsRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)
