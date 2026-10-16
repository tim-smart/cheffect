import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as EventJournal from "effect/eventlog/EventJournal"
import { applyLww, stampAll } from "@/lib/Lww"
import { everyOrder } from "./harness/orders"

// Handlers converge through field-level last-writer-wins on entry time, with
// the entry id as the tiebreak, so every device ends in the same state whatever
// order entries arrive in. Module convergence tests cover the rest through the
// handlers; the tiebreak needs entries in the same millisecond.

const entryAt = (msecs: number) =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs }),
    event: "Test",
    primaryKey: "k",
    payload: new Uint8Array(),
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
