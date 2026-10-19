import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { SettingEvent } from "./Events"

// One row per setting name, with the value as written.
export const SettingRow = SettingEvent.schema
export type SettingRow = typeof SettingRow.Type

export class SettingsTable extends IndexedDbTable.make({
  name: "settings",
  schema: SettingRow,
  keyPath: "id",
}) {}
