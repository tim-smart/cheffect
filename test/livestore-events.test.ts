import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Schema from "effect/Schema"
import { schema } from "@/livestore/schema"
import fixtures from "./fixtures/livestore-events.json" with { type: "json" }

// Synced events are persisted in the event log and pushed to the sync
// backend, so their encoded form has to stay readable across upgrades.
// These fixtures were captured as Effect 3 encoded them.

const syncedEventNames = Array.from(schema.eventsDefsMap.values())
  .filter((def) => !def.options.clientOnly)
  .map((def) => def.name)

test("every synced event has a wire-format fixture", () => {
  const covered = new Set(fixtures.map((fixture) => fixture.name))
  const missing = syncedEventNames.filter((name) => !covered.has(name))
  assert.deepEqual(missing, [])
})

for (const [index, fixture] of fixtures.entries()) {
  test(`${fixture.name} #${index} decodes and re-encodes unchanged`, () => {
    const def = schema.eventsDefsMap.get(fixture.name)
    assert.ok(def, `unknown event ${fixture.name}`)
    const args = "args" in fixture ? fixture.args : undefined
    const decoded = Schema.decodeUnknownSync(def.schema)(args)
    assert.deepEqual(Schema.encodeSync(def.schema)(decoded), args)
  })
}
