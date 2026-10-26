import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Schema from "effect/Schema"
import type * as Event from "effect/eventlog/Event"
import { CheffectEvents } from "@/EventLog"
import { GroceryItemEvent, IngredientAisleEvent } from "@/Groceries/Events"
import fixtures from "./fixtures/eventlog-events.json" with { type: "json" }

// Every event is persisted in the journal and synced to other devices, so its
// SchemaBinary bytes have to stay readable across upgrades. `bytes` is the
// source of truth; `json` only makes diffs readable. Fixtures are captured
// with `scripts/capture-event-fixtures.ts` and only ever added to.

const events = new Map<string, Event.Any>(
  CheffectEvents.groups.flatMap((group) =>
    Object.values<Event.Any>(group.events).map((event) => [event.tag, event]),
  ),
)

test("every event has a wire fixture, and each decodes and re-encodes to the same bytes", () => {
  assert.deepEqual(
    [...new Set(fixtures.map((fixture) => fixture.tag))].sort(),
    [...events.keys()].sort(),
  )
  for (const [index, fixture] of fixtures.entries()) {
    const event = events.get(fixture.tag)!
    const bytes = new Uint8Array(Buffer.from(fixture.bytes, "base64"))
    const decoded = Schema.decodeUnknownSync(event.payloadSchemaBinary)(bytes)
    const what = `${fixture.tag} #${index}`
    assert.deepEqual(
      Buffer.from(Schema.encodeSync(event.payloadSchemaBinary)(decoded)),
      Buffer.from(bytes),
      what,
    )
    assert.deepEqual(
      Schema.encodeSync(Schema.toCodecJson(event.payload))(decoded),
      fixture.json,
      what,
    )
  }
})

test("entries with an aisle since folded into another decode as that aisle", () => {
  const decode = (event: Event.Any, json: unknown) =>
    Schema.decodeUnknownSync(Schema.toCodecJson(event.payload))(json)
  const aisleSet = (aisle: string) =>
    decode(IngredientAisleEvent, {
      _tag: "set",
      row: { name: "salmon", aisle },
    })
  const itemPatch = (aisle: string) =>
    decode(GroceryItemEvent, {
      _tag: "patch",
      key: { id: "AZPHoBssTe+BI8D/7gAAAQ==" },
      fields: { aisle },
    })
  assert.deepEqual(aisleSet("Seafood"), aisleSet("Meat & Seafood"))
  assert.deepEqual(itemPatch("Seafood"), itemPatch("Meat & Seafood"))
})
