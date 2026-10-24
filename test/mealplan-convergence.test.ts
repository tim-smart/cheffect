import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MealPlanLayer } from "@/MealPlan"
import { MealPlanDayNoteEvent, MealPlanEvents } from "@/MealPlan/Events"
import {
  MealPlanDayNote,
  MealPlanDayNoteIdFromString,
} from "@/domain/MealPlanDayNote"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  pick,
  readTable,
} from "./harness/convergence"

// A `set` of a note that exists replaces it as the newest write, and an older
// `set` keeps the fields newer patches wrote, so two devices importing the
// same file still agree. The first set of each note is delivered before the
// permuted entries.

const noteEvent = MealPlanEvents.events[MealPlanDayNoteEvent.tag]

const mondayNote = Schema.decodeSync(MealPlanDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-ba9876543210",
)
const fridayNote = Schema.decodeSync(MealPlanDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-ba9876543211",
)
type NoteId = typeof mondayNote

// Days are dates without a time, stored the way the domain encodes them.
const day = (iso: string) => DateTime.makeUnsafe(iso)
const monday = "2025-10-13"
const tuesday = "2025-10-14"
const thursday = "2025-10-16"
const friday = "2025-10-17"

const noteAdded = (msecs: number, id: NoteId, onDay: string, note: string) =>
  makeEntry({
    msecs,
    event: noteEvent,
    payload: MealPlanDayNoteEvent.set(
      MealPlanDayNote.insert.make({
        id,
        day: day(onDay),
        note,
        createdAt: DateTime.makeUnsafe(msecs),
        updatedAt: DateTime.makeUnsafe(msecs),
      }),
    ).payload,
  })

const noteUpdated = (msecs: number, id: NoteId, onDay: string, note: string) =>
  makeEntry({
    msecs,
    event: noteEvent,
    payload: MealPlanDayNoteEvent.patch(
      { id },
      {
        day: day(onDay),
        note,
        updatedAt: DateTime.makeUnsafe(msecs),
      },
    ).payload,
  })

const layer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(MealPlanEvents),
    MealPlanLayer,
  ).pipe(
    Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
    Layer.provide(Layer.succeed(EventLog.Identity, identity)),
  )
  return Layer.mergeAll(eventLog, remote.pipe(Layer.provide(eventLog))).pipe(
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerDatabase),
    Layer.provideMerge(Reactivity.layer),
    Layer.provideMerge(layerFreshIndexedDb),
  )
}

const read = Effect.map(readTable("mealPlanDayNotes"), (mealPlanDayNotes) => ({
  mealPlanDayNotes,
}))

const notes = (state: {
  readonly mealPlanDayNotes: ReadonlyArray<Record<string, unknown>>
}) => state.mealPlanDayNotes.map((row) => pick(row, ["day", "note"]))

test("a re-set day note merges with concurrent patches as the newer write", async () => {
  // A newer set of an existing note writes its fields...
  const newerSet = await converge({
    layer,
    read,
    setup: [noteAdded(1000, mondayNote, monday, "Leftovers")],
    concurrent: [
      noteUpdated(2000, mondayNote, monday, "Pizza"),
      noteAdded(3000, mondayNote, tuesday, "Tacos"),
    ],
  })
  assert.deepEqual(notes(newerSet), [{ day: tuesday, note: "Tacos" }])
  // ...and an older one loses to a newer update.
  const olderSet = await converge({
    layer,
    read,
    setup: [noteAdded(1000, fridayNote, friday, "Takeaway")],
    concurrent: [
      noteAdded(2500, fridayNote, friday, "Fish and chips"),
      noteUpdated(3500, fridayNote, thursday, "Curry"),
    ],
  })
  assert.deepEqual(notes(olderSet), [{ day: thursday, note: "Curry" }])
})
