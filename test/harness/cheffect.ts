import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { AiChatLayer } from "@/AiChat/Handlers"
import { CheffectEvents, journalDatabaseName } from "@/EventLog"
import { GroceriesLayer } from "@/Groceries"
import { QueryBuilder, layerDatabase, tableNames } from "@/IndexedDb"
import { MealPlanLayer } from "@/MealPlan"
import { MenusLayer } from "@/Menus"
import { RecipesLayer } from "@/Recipes"
import { SettingsLayer } from "@/Settings/Handlers"
import { TimersLayer } from "@/Timers"
import { readTable, type Row } from "./convergence"
import { testIdentity } from "./eventlog"
import { layerFreshIndexedDb } from "./indexeddb"

// The app's whole EventLog on a fresh fake-indexeddb: every group, every
// handler, the journal under its real name so the durability barrier finds
// it. Each `Effect.provide` builds a new, empty device.
export const layerCheffect = EventLog.layer(
  CheffectEvents,
  Layer.mergeAll(
    RecipesLayer,
    SettingsLayer,
    TimersLayer,
    MealPlanLayer,
    MenusLayer,
    GroceriesLayer,
    AiChatLayer,
  ),
).pipe(
  Layer.provide(EventJournal.layerIndexedDb({ database: journalDatabaseName })),
  Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(layerFreshIndexedDb),
)

// Every table's rows as the next page load would read them.
export const snapshot = Effect.gen(function* () {
  const state: Record<string, ReadonlyArray<Row>> = {}
  for (const name of tableNames) {
    state[name] = yield* readTable(name)
  }
  return state
})

export const journalEntries = EventLog.EventLog.use((log) => log.entries)
