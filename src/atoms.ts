import { Atom } from "@effect-atom/atom-react"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"

export const kvsRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)
