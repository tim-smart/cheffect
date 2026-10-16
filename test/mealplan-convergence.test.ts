import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { CheffectEvents } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MealPlanLayer } from "@/MealPlan"
import { MealPlanEvents } from "@/MealPlan/Events"
import {
  MealPlanDayNote,
  MealPlanDayNoteIdFromString,
} from "@/domain/MealPlanDayNote"
import { MealPlanEntryIdFromString } from "@/domain/MealPlanEntry"
import { RecipeIdFromString } from "@/domain/Recipe"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The MealPlan handlers converge whatever order remote entries arrive in
// (TIM-248): `MealPlanAdd` creates, `MealPlanSetDay` patches `day` under
// last-writer-wins and does nothing when the row is missing, and both removes
// hard-delete, so a late update can't bring the row back. `MealPlanDayNoteAdd`
// creates, or merges into an existing row under last-writer-wins, as a
// re-import of the same note does.
//
// The first add of a row is delivered before the permuted entries: nothing
// can move or remove a row its device hasn't received. No recipe is ever
// delivered, because handlers only touch their own tables and an entry may
// arrive before its recipe.

const {
  MealPlanAdd,
  MealPlanSetDay,
  MealPlanRemove,
  MealPlanDayNoteAdd,
  MealPlanDayNoteUpdate,
  MealPlanDayNoteRemove,
} = MealPlanEvents.events

const recipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-456789abcdef",
)

const dinnerIdString = "0193c7a0-1b2c-4def-8123-0123456789ab"
const dinner = Schema.decodeSync(MealPlanEntryIdFromString)(dinnerIdString)
const lunch = Schema.decodeSync(MealPlanEntryIdFromString)(
  "0193c7a0-1b2c-4def-8123-0123456789ac",
)
type EntryId = typeof dinner

const mondayNoteIdString = "0193c7a0-1b2c-4def-8123-ba9876543210"
const mondayNote = Schema.decodeSync(MealPlanDayNoteIdFromString)(
  mondayNoteIdString,
)
const fridayNote = Schema.decodeSync(MealPlanDayNoteIdFromString)(
  "0193c7a0-1b2c-4def-8123-ba9876543211",
)
type NoteId = typeof mondayNote

// Days are dates without a time, stored the way the domain encodes them.
const day = (iso: string) => DateTime.makeUnsafe(iso)
const monday = "2025-10-13"
const tuesday = "2025-10-14"
const wednesday = "2025-10-15"
const thursday = "2025-10-16"
const friday = "2025-10-17"

const added = (id: EntryId, onDay: string) =>
  makeEntry({
    msecs: 1000,
    event: MealPlanAdd,
    payload: { id, recipeId, day: day(onDay) },
  })

const moved = (msecs: number, id: EntryId, toDay: string) =>
  makeEntry({
    msecs,
    event: MealPlanSetDay,
    payload: { id, day: day(toDay) },
  })

const removed = (msecs: number, id: EntryId) =>
  makeEntry({ msecs, event: MealPlanRemove, payload: { id } })

const noteAdded = (msecs: number, id: NoteId, onDay: string, note: string) =>
  makeEntry({
    msecs,
    event: MealPlanDayNoteAdd,
    payload: MealPlanDayNote.insert.make({
      id,
      day: day(onDay),
      note,
      createdAt: DateTime.makeUnsafe(msecs),
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const noteUpdated = (msecs: number, id: NoteId, onDay: string, note: string) =>
  makeEntry({
    msecs,
    event: MealPlanDayNoteUpdate,
    payload: MealPlanDayNote.update.make({
      id,
      day: day(onDay),
      note,
      updatedAt: DateTime.makeUnsafe(msecs),
    }),
  })

const noteRemoved = (msecs: number, id: NoteId) =>
  makeEntry({ msecs, event: MealPlanDayNoteRemove, payload: { id } })

const makeLayer: MakeLayer = (identity, remote) => {
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

const read = Effect.gen(function* () {
  return {
    mealPlan: yield* readTable("mealPlan"),
    mealPlanDayNotes: yield* readTable("mealPlanDayNotes"),
  }
})

test("the MealPlan group is in the catalogue, keyed by the canonical id string", () => {
  assert.ok(
    (CheffectEvents.groups as ReadonlyArray<unknown>).includes(MealPlanEvents),
  )
  assert.deepEqual(Object.keys(MealPlanEvents.events).sort(), [
    "MealPlanAdd",
    "MealPlanDayNoteAdd",
    "MealPlanDayNoteRemove",
    "MealPlanDayNoteUpdate",
    "MealPlanRemove",
    "MealPlanSetDay",
  ])
  for (const entry of [
    added(dinner, monday),
    moved(2000, dinner, tuesday),
    removed(2000, dinner),
  ]) {
    assert.equal(entry.primaryKey, dinnerIdString, entry.event)
  }
  for (const entry of [
    noteAdded(1000, mondayNote, monday, "Leftovers"),
    noteUpdated(2000, mondayNote, monday, "Pizza"),
    noteRemoved(2000, mondayNote),
  ]) {
    assert.equal(entry.primaryKey, mondayNoteIdString, entry.event)
  }
})

test("the newest move of a meal plan entry wins, and other entries are untouched", async () => {
  const { mealPlan } = await converge({
    layer: makeLayer,
    read,
    setup: [added(dinner, monday), added(lunch, monday)],
    concurrent: [
      moved(2000, dinner, tuesday),
      moved(3000, dinner, wednesday),
      moved(2500, dinner, thursday),
    ],
  })
  // Ids and recipe ids are stored as UUID bytes.
  const byDay = (onDay: string) =>
    mealPlan
      .filter((row) => row.day === onDay)
      .map((row) => pick(row, ["id", "recipeId"]))
  assert.equal(mealPlan.length, 2)
  assert.deepEqual(byDay(wednesday), [{ id: dinner, recipeId }])
  assert.deepEqual(byDay(monday), [{ id: lunch, recipeId }])
})

test("a removed meal plan entry stays removed, with moves either side of the remove", async () => {
  const { mealPlan } = await converge({
    layer: makeLayer,
    read,
    setup: [added(dinner, monday), added(lunch, monday)],
    concurrent: [
      moved(2000, dinner, tuesday),
      removed(3000, dinner),
      // A move from a device that hadn't seen the remove yet.
      moved(4000, dinner, wednesday),
      moved(2500, lunch, friday),
    ],
  })
  assert.deepEqual(pick(only(mealPlan), ["day"]), { day: friday })
})

test("a re-added day note merges with concurrent updates under last-writer-wins", async () => {
  const { mealPlanDayNotes } = await converge({
    layer: makeLayer,
    read,
    setup: [
      noteAdded(1000, mondayNote, monday, "Leftovers"),
      noteAdded(1000, fridayNote, friday, "Takeaway"),
    ],
    concurrent: [
      // A newer add of an existing note writes its fields...
      noteUpdated(2000, mondayNote, monday, "Pizza"),
      noteAdded(3000, mondayNote, tuesday, "Tacos"),
      // ...and an older one loses to a newer update.
      noteAdded(2500, fridayNote, friday, "Fish and chips"),
      noteUpdated(3500, fridayNote, thursday, "Curry"),
    ],
  })
  const notes = mealPlanDayNotes.map((row) =>
    pick(row, ["day", "note", "updatedAt"]),
  )
  assert.deepEqual(
    notes.sort((a, b) => String(a.day).localeCompare(String(b.day))),
    [
      { day: tuesday, note: "Tacos", updatedAt: 3000 },
      { day: thursday, note: "Curry", updatedAt: 3500 },
    ],
  )
})

test("a removed day note stays removed, with updates either side of the remove", async () => {
  const { mealPlanDayNotes } = await converge({
    layer: makeLayer,
    read,
    setup: [
      noteAdded(1000, mondayNote, monday, "Leftovers"),
      noteAdded(1000, fridayNote, friday, "Takeaway"),
    ],
    concurrent: [
      noteUpdated(2000, mondayNote, monday, "Pizza"),
      noteRemoved(3000, mondayNote),
      // An update from a device that hadn't seen the remove yet.
      noteUpdated(4000, mondayNote, monday, "Tacos"),
      noteUpdated(2500, fridayNote, friday, "Curry"),
    ],
  })
  assert.deepEqual(pick(only(mealPlanDayNotes), ["day", "note"]), {
    day: friday,
    note: "Curry",
  })
})
