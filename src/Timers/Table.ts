import * as Schema from "effect/Schema"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import { Timer } from "@/domain/Timer"

// Rows are the domain fields. Timer ids are random, so a dismiss hard-deletes.
export const TimerRow = Schema.Struct(Timer.fields)
export type TimerRow = typeof TimerRow.Type

export class TimersTable extends IndexedDbTable.make({
  name: "timers",
  schema: TimerRow,
  keyPath: "id",
}) {}
