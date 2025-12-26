import { Store } from "@/livestore/atoms"
import { events, tables } from "@/livestore/schema"
import * as KeyValueStore from "@effect/platform/KeyValueStore"
import { queryDb } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const layerKvsLivestore = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.gen(function* () {
    const store = yield* Store

    return KeyValueStore.makeStringOnly({
      get: (key) =>
        Effect.sync(() => {
          const values = store.query(get$(key))
          return Array.head(values)
        }),
      set: (key, value) =>
        Effect.sync(() => {
          store.commit(events.keyValueSet({ key, value }))
        }),
      remove: (key) =>
        Effect.sync(() => {
          store.commit(events.keyValueRemove({ key }))
        }),
      clear: Effect.sync(() => {
        store.commit(events.keyValueClear())
      }),
      size: Effect.sync(() => store.query(size$)),
    })
  }),
)

const get$ = (key: string) =>
  queryDb(tables.keyValues.select("value").where({ key }), { deps: [key] })

const size$ = queryDb(tables.keyValues.count())
