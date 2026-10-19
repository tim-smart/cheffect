import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as EventRow from "effect/eventlog/EventRow"

// Tags are permanent wire names. Every stored entry is decoded again with the
// current row schema, so a field may only be added with a decoding default,
// or removed.
//
// `id` is the setting name and `value` the setting's encoded `Option` as a
// JSON string. Clearing a setting writes `None`, an ordinary value, so a
// setting is never removed.
export const SettingEvent = EventRow.make("Setting", {
  key: "id",
  schema: Schema.Struct({
    id: Schema.String,
    value: Schema.String,
  }),
})

export const SettingsEvents = EventGroup.empty.add(SettingEvent)
