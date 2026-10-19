import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventRow from "effect/eventlog/EventRow"
import { QueryBuilder } from "@/IndexedDb"
import { tableRowHandler } from "@/lib/rowHandler"
import { SettingEvent, SettingsEvents } from "./Events"

// The handlers live here rather than in `src/Settings.ts`, which imports
// `src/EventLog.ts` and so can't be imported by it.

const SettingsHandlers = EventLog.group(SettingsEvents, (handlers) =>
  Effect.gen(function* () {
    const db = yield* QueryBuilder
    return handlers.handle(
      SettingEvent.tag,
      tableRowHandler(db, "settings", SettingEvent, { tableKey: (id) => id }),
    )
  }),
)

const SettingsReactivity = EventLog.groupReactivity(SettingsEvents, {
  [SettingEvent.tag]: ["settings"],
})

export const SettingsLayer = Layer.mergeAll(
  SettingsHandlers,
  SettingsReactivity,
  EventRow.compaction(SettingsEvents, SettingEvent),
)
