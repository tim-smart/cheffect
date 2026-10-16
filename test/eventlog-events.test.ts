import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Schema from "effect/Schema"
import type * as Event from "effect/eventlog/Event"
import { CheffectEvents } from "@/EventLog"
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

test("every event tag has a wire fixture", () => {
  const covered = new Set(fixtures.map((fixture) => fixture.tag))
  const missing = Array.from(events.keys()).filter((tag) => !covered.has(tag))
  assert.deepEqual(missing, [])
})

test("every wire fixture names an event in the catalogue", () => {
  const unknown = fixtures
    .map((fixture) => fixture.tag)
    .filter((tag) => !events.has(tag))
  assert.deepEqual(unknown, [])
})

for (const [index, fixture] of fixtures.entries()) {
  test(`${fixture.tag} #${index} decodes and re-encodes to the same bytes`, (t) => {
    const event = events.get(fixture.tag)
    if (event === undefined) return t.skip(`unknown event ${fixture.tag}`)
    const bytes = new Uint8Array(Buffer.from(fixture.bytes, "base64"))
    const decoded = Schema.decodeUnknownSync(event.payloadSchemaBinary)(bytes)
    assert.deepEqual(
      Buffer.from(Schema.encodeSync(event.payloadSchemaBinary)(decoded)),
      Buffer.from(bytes),
    )
    assert.deepEqual(
      Schema.encodeSync(Schema.toCodecJson(event.payload))(decoded),
      fixture.json,
    )
  })
}
