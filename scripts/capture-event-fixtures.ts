// Captures wire fixtures for event tags that don't have one yet:
//
//   pnpm exec tsx scripts/capture-event-fixtures.ts
//
// Payloads come from `test/fixtures/event-samples.ts`. Tags that already have
// fixtures are left alone, because a fixture records the format as it shipped
// and is only ever added to. A breaking payload change gets a new tag.

import * as fs from "node:fs"
import * as Schema from "effect/Schema"
import type * as Event from "effect/eventlog/Event"
import * as prettier from "prettier"
import { CheffectEvents } from "@/EventLog"
import { eventSamples } from "../test/fixtures/event-samples"

const fixturesPath = new URL(
  "../test/fixtures/eventlog-events.json",
  import.meta.url,
)

interface Fixture {
  readonly tag: string
  readonly json: unknown
  readonly bytes: string
}

const events = new Map<string, Event.Any>(
  CheffectEvents.groups.flatMap((group) =>
    Object.values<Event.Any>(group.events).map((event) => [event.tag, event]),
  ),
)

const fixtures: Array<Fixture> = JSON.parse(
  fs.readFileSync(fixturesPath, "utf8"),
)
const covered = new Set(fixtures.map((fixture) => fixture.tag))

const captured: Array<string> = []
for (const sample of eventSamples) {
  if (covered.has(sample.event)) continue
  const event = events.get(sample.event)
  if (event === undefined) {
    throw new Error(`No event ${sample.event} in CheffectEvents`)
  }
  const bytes = Schema.encodeSync(event.payloadSchemaBinary)(sample.payload)
  fixtures.push({
    tag: sample.event,
    json: Schema.encodeSync(Schema.toCodecJson(event.payload))(sample.payload),
    bytes: Buffer.from(bytes).toString("base64"),
  })
  captured.push(sample.event)
}

const missing = Array.from(events.keys()).filter(
  (tag) => !covered.has(tag) && !captured.includes(tag),
)
if (missing.length > 0) {
  console.warn(`No sample for: ${missing.join(", ")}`)
}

fs.writeFileSync(
  fixturesPath,
  await prettier.format(JSON.stringify(fixtures), { parser: "json" }),
)
console.log(`Captured ${captured.length} fixture(s): ${captured.join(", ")}`)
