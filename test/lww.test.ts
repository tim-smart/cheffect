import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as EventJournal from "effect/eventlog/EventJournal"
import {
  applyLww,
  isLive,
  lwwRemove,
  lwwSet,
  stampAll,
  stripLww,
} from "@/lib/Lww"
import { everyOrder } from "./harness/orders"

// Handlers converge through field-level last-writer-wins on entry time, with
// the entry id as the tiebreak, so every device ends in the same state whatever
// order entries arrive in. Rows keep the stamps in a hidden `_lww` map and
// reusable keys keep a `deleted: 0 | 1` tombstone under the same rule.

const entryAt = (msecs: number) =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event: "Test",
    primaryKey: "k",
    payload: new Uint8Array(),
  })

test("each field keeps its newest write whatever order the writes arrive in", () => {
  const created = stampAll(
    { id: "r1", title: "Soup", rating: 3 },
    entryAt(1000),
  )
  const writes = [
    { patch: { title: "Stew" }, entry: entryAt(3000) },
    { patch: { title: "Broth", rating: 5 }, entry: entryAt(2000) },
  ]
  for (const order of everyOrder(writes)) {
    const row = order.reduce(
      (row, { patch, entry }) => applyLww(row, patch, entry),
      created,
    )
    assert.deepEqual(stripLww(row), { id: "r1", title: "Stew", rating: 5 })
  }
})

test("writes in the same millisecond are settled by entry id, the same way everywhere", () => {
  const created = stampAll({ id: "r1", title: "Soup" }, entryAt(1000))
  const a = { patch: { title: "A" }, entry: entryAt(2000) }
  const b = { patch: { title: "B" }, entry: entryAt(2000) }
  const expected = a.entry.idString > b.entry.idString ? "A" : "B"
  for (const order of everyOrder([a, b])) {
    const row = order.reduce(
      (row, { patch, entry }) => applyLww(row, patch, entry),
      created,
    )
    assert.equal(row.title, expected)
  }
})

test("a reusable key can be removed and set again", () => {
  type Row = {
    name: string
    aisle: string
    deleted: 0 | 1
    _lww: Record<string, string>
  }
  const steps: ReadonlyArray<(row: Row | undefined) => Row> = [
    (row) => lwwSet(row, { name: "flour", aisle: "Baking" }, entryAt(1000)),
    (row) => lwwRemove(row, { name: "flour", aisle: "" }, entryAt(3000)),
    (row) => lwwSet(row, { name: "flour", aisle: "Pantry" }, entryAt(2000)),
  ]
  for (const order of everyOrder(steps)) {
    const row = order.reduce<Row | undefined>(
      (row, step) => step(row),
      undefined,
    )
    assert.ok(row && !isLive(row), "the newest write is the remove")

    const revived = lwwSet(
      row,
      { name: "flour", aisle: "Flour & grains" },
      entryAt(4000),
    )
    assert.ok(isLive(revived))
    assert.deepEqual(stripLww(revived), {
      name: "flour",
      aisle: "Flour & grains",
      deleted: 0,
    })
  }
})
