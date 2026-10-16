import * as Schema from "effect/Schema"
import * as EventGroup from "effect/eventlog/EventGroup"

// Tags are permanent wire names. A breaking payload change gets a new tag and
// the old handler stays.
//
// `id` is the setting name and `value` the setting's encoded `Option` as a
// JSON string. Clearing a setting writes `None`, an ordinary value, so there
// is no remove event and no tombstone.
export const SettingsEvents = EventGroup.empty.add({
  tag: "SettingsSet",
  primaryKey: ({ id }) => id,
  payload: Schema.Struct({
    id: Schema.String,
    value: Schema.String,
  }),
})
