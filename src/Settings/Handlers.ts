import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import { QueryBuilder } from "@/IndexedDb"
import { applyLww, stampAll } from "@/lib/Lww"
import { SettingsEvents } from "./Events"

// A setting's key is its name, so `SettingsSet` is an upsert: it inserts the
// row when it's missing and otherwise patches `value` under last-writer-wins.
//
// The handlers live here rather than in `src/Settings.ts`, which still pulls
// in LiveStore for export and import.

const SettingsHandlers = EventLog.group(SettingsEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    const settings = db.from("settings")

    return handlers.handle("SettingsSet", ({ payload, entry }) =>
      Effect.gen(function* () {
        const [row] = yield* settings.select().equals(payload.id).limit(1)
        if (row === undefined) {
          yield* settings.insert(
            stampAll({ id: payload.id, value: payload.value }, entry),
          )
          return
        }
        const next = applyLww(row, { value: payload.value }, entry)
        if (next !== row) yield* settings.upsert(next)
      }).pipe(Effect.orDie),
    )
  }),
)

const SettingsReactivity = EventLog.groupReactivity(SettingsEvents, {
  SettingsSet: ["settings"],
})

export const SettingsLayer = Layer.mergeAll(
  SettingsHandlers,
  SettingsReactivity,
)
