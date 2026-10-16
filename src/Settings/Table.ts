import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"

// One row per setting name, with the value as written and the hidden
// last-writer-wins stamps.
export const SettingRow = Schema.Struct({
  id: Schema.String,
  value: Schema.String,
  _lww: Schema.Record(Schema.String, Schema.String),
})
export type SettingRow = typeof SettingRow.Type

export class SettingsTable extends IndexedDbTable.make({
  name: "settings",
  schema: SettingRow,
  keyPath: "id",
}) {}
