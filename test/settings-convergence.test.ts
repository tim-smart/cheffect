import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { CheffectEvents } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { SettingsEvents } from "@/Settings/Events"
import { SettingsLayer } from "@/Settings/Handlers"
import { layerFreshIndexedDb } from "./harness/indexeddb"
import { makeEntry } from "./harness/eventlog"
import {
  type MakeLayer,
  converge,
  only,
  pick,
  readTable,
} from "./harness/convergence"

// The Settings handler converges whatever order remote entries arrive in.
// A setting's key is its name, so it is reusable: `SettingsSet` is an upsert
// with last-writer-wins on `value`, and clearing writes an encoded `None`,
// which is an ordinary value rather than a remove (TIM-254).

const { SettingsSet } = SettingsEvents.events

// `value` is the setting's encoded `Option` as a JSON string, as today.
const encodeValue = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(Schema.Option(Schema.String))),
)
const some = (value: string) => encodeValue(Option.some(value))
const none = encodeValue(Option.none())

const set = (msecs: number, id: string, value: string) =>
  makeEntry({ msecs, event: SettingsSet, payload: { id, value } })

const makeLayer: MakeLayer = (identity, remote) => {
  const eventLog = EventLog.layer(
    EventLog.schema(SettingsEvents),
    SettingsLayer,
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

const read = Effect.map(readTable("settings"), (settings) => ({ settings }))

const valueOf = (rows: ReadonlyArray<Record<string, unknown>>, id: string) =>
  rows.find((row) => row.id === id)?.value

test("the Settings group is in the catalogue, keyed by the setting name", () => {
  assert.ok(
    (CheffectEvents.groups as ReadonlyArray<unknown>).includes(SettingsEvents),
  )
  assert.deepEqual(Object.keys(SettingsEvents.events), ["SettingsSet"])
  assert.equal(set(1000, "aiCountry", some("NZ")).primaryKey, "aiCountry")
})

test("on the same setting the newest entry wins, and other settings are untouched", async () => {
  const { settings } = await converge({
    layer: makeLayer,
    read,
    concurrent: [
      set(1000, "aiCountry", some("AU")),
      set(3000, "aiCountry", some("NZ")),
      set(2000, "aiCountry", some("GB")),
      set(2500, "aiChatModel", some("gpt-6.1-sol")),
    ],
  })
  assert.equal(settings.length, 2)
  assert.equal(valueOf(settings, "aiCountry"), some("NZ"))
  assert.equal(valueOf(settings, "aiChatModel"), some("gpt-6.1-sol"))
})

test("a setting can be cleared and set again", async () => {
  const { settings } = await converge({
    layer: makeLayer,
    read,
    concurrent: [
      set(1000, "openAiApiKey", some("sk-old")),
      set(2000, "openAiApiKey", none),
      set(3000, "openAiApiKey", some("sk-new")),
    ],
  })
  assert.deepEqual(pick(only(settings), ["id", "value"]), {
    id: "openAiApiKey",
    value: some("sk-new"),
  })
})

test("a setting cleared last stays cleared, even when the clear arrives first", async () => {
  const { settings } = await converge({
    layer: makeLayer,
    read,
    concurrent: [
      set(1000, "openAiModel", some("gpt-5.4")),
      set(2000, "openAiModel", some("gpt-6")),
      set(3000, "openAiModel", none),
    ],
  })
  assert.deepEqual(pick(only(settings), ["id", "value"]), {
    id: "openAiModel",
    value: none,
  })
})
