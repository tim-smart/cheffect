import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { Timer } from "@/domain/Timer"

// Rows are the domain fields plus the hidden last-writer-wins stamps. Timer
// ids are random, so a dismiss hard-deletes and needs no tombstone.
export const TimerRow = Schema.Struct({
  ...Timer.fields,
  _lww: Schema.Record(Schema.String, Schema.String),
})
export type TimerRow = typeof TimerRow.Type

export class TimersTable extends IndexedDbTable.make({
  name: "timers",
  schema: TimerRow,
  keyPath: "id",
}) {}
