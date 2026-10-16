import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Layer from "effect/Layer"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"

// A key-value store for state that stays on this device, in localStorage
// under the `cheffect:` prefix. Its only key is the AI chat history until
// that moves to the EventLog with the AiChat module.
export const layerKvs = Layer.effect(
  KeyValueStore.KeyValueStore,
  KeyValueStore.KeyValueStore.useSync((store) =>
    KeyValueStore.prefix(store, "cheffect:"),
  ),
).pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage))
