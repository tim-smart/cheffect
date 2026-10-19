import { test } from "node:test"
import * as assert from "node:assert/strict"
import "fake-indexeddb/auto"
import { IDBFactory, IDBKeyRange } from "fake-indexeddb"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import {
  identityKey,
  journalDatabaseName,
  layerJournal,
  loadOrCreateIdentity,
  parseSyncServerUrl,
  storeId,
  syncEnabledKey,
  syncServerUrlKey,
} from "@/EventLog"
import { QueryBuilder, databaseName, layerDatabase } from "@/IndexedDb"
import { RecipesLayer } from "@/Recipes"
import { RecipeEvent, RecipeEvents } from "@/Recipes/Events"
import { RecipeIdFromString } from "@/domain/Recipe"
import { join, makeShareLink, parseJoinInput } from "@/Sync/Join"
import { sampleRecipe } from "./fixtures/event-samples"
import { testIdentity } from "./harness/eventlog"
import { countRecords } from "./harness/indexeddb"

// Joining another collection. The join wipes the device,
// then clears the per-collection keys, then writes the new identity, server
// URL and Enable Sync. These tests fail each storage step in turn: whatever
// step a crash lands on, the device must never hold the new identity next to
// old data, or a later sync would upload one collection into another.

const recipeSortByKey = "cheffect:recipeSortBy"
const groceryCurrentListKey = "cheffect:groceryCurrentList"
const mealPlanWeekStartCacheKey = "setting:mealPlanWeekStart"

const oldServerUrl = "wss://old.example.com/sync"
const newServerUrl = "wss://new.example.com/sync"

const CheffectRecipes = EventLog.schema(RecipeEvents)

const lateRecipeId = Schema.decodeSync(RecipeIdFromString)(
  "0193c7a0-1b2c-4def-8123-0000000000aa",
)

// The values `Atom.kvs` reads, through the same schema stores.
const settings = (kvs: KeyValueStore.KeyValueStore) => ({
  identity: KeyValueStore.toSchemaStore(kvs, Schema.String),
  serverUrl: KeyValueStore.toSchemaStore(kvs, Schema.String),
  enabled: KeyValueStore.toSchemaStore(kvs, Schema.Boolean),
})

// A fresh IDBFactory that remembers which databases have a deletion still
// waiting. `deleteDatabase` waits for every open connection to close, so a
// deletion requested but not finished when the tab dies may never happen.
const makeFactory = () => {
  const indexedDB = new IDBFactory()
  const pendingDeletes = new Set<string>()
  const deleteDatabase = indexedDB.deleteDatabase.bind(indexedDB)
  indexedDB.deleteDatabase = (name: string) => {
    pendingDeletes.add(name)
    const request = deleteDatabase(name)
    const settle = () => pendingDeletes.delete(name)
    request.addEventListener("success", settle)
    request.addEventListener("error", settle)
    return request
  }
  // The journal reaches for the global rather than the IndexedDb service.
  ;(globalThis as any).indexedDB = indexedDB
  return { indexedDB, pendingDeletes }
}

type Factory = ReturnType<typeof makeFactory>

// Rows the next page load would find, or `"pending"` while a deletion is
// still waiting on an open connection: a crash then keeps the data.
const recordsOnDisk = (
  { indexedDB, pendingDeletes }: Factory,
  database: string,
  store: string,
): Effect.Effect<number | "pending", Error> =>
  Effect.gen(function* () {
    if (pendingDeletes.has(database)) return "pending" as const
    const existing = yield* Effect.promise(() => indexedDB.databases())
    if (!existing.some((info) => info.name === database)) return 0
    return yield* countRecords(indexedDB, database, store)
  })

interface DeviceState {
  readonly identity: Option.Option<string>
  readonly recipes: number | "pending"
  readonly entries: number | "pending"
}

const hasData = (state: DeviceState) =>
  state.recipes !== 0 || state.entries !== 0

const readState = (factory: Factory, kvs: KeyValueStore.KeyValueStore) =>
  Effect.gen(function* () {
    return {
      identity: yield* settings(kvs).identity.get(identityKey),
      recipes: yield* recordsOnDisk(factory, databaseName, "recipes"),
      entries: yield* recordsOnDisk(factory, journalDatabaseName, "entries"),
    } satisfies DeviceState
  })

// Old identity with its data, or an empty device; never the new identity
// alongside old data.
const assertSafe = (
  state: DeviceState,
  options: { readonly oldIdentity: string; readonly when: string },
) => {
  if (Option.getOrUndefined(state.identity) === options.oldIdentity) return
  assert.ok(
    !hasData(state),
    `${options.when}: the identity changed while old data is still on the device (${JSON.stringify(state)})`,
  )
}

class InjectedFailure extends Error {}

// Fails the `failAt`-th storage write the join makes, before it happens, and
// records the device as it stood at that moment. `ops` lists every write the
// join got to, in order. `interleave` starts an effect alongside the join,
// just before the write it names.
const makeFaults = (failAt: number | undefined) => {
  const ops: Array<string> = []
  let crashState: Effect.Effect<DeviceState, unknown> | undefined
  let crashed: DeviceState | undefined
  let interleave:
    { readonly at: number; readonly effect: Effect.Effect<void> } | undefined
  const fibers: Array<Fiber.Fiber<void>> = []
  const start = Effect.suspend(() => {
    const effect = interleave?.effect
    interleave = undefined
    return effect === undefined
      ? Effect.void
      : Effect.forkDetach(effect).pipe(
          Effect.map((fiber) => {
            fibers.push(fiber)
          }),
        )
  })
  const step = <E>(op: string, fail: (cause: unknown) => E) =>
    Effect.gen(function* () {
      if (ops.length === interleave?.at) yield* start
      if (ops.length === failAt) {
        crashed = yield* crashState!.pipe(Effect.orDie)
        return yield* Effect.fail(fail(new InjectedFailure(op)))
      }
      ops.push(op)
    })
  return {
    ops,
    step,
    onCrash: (read: Effect.Effect<DeviceState, unknown>) => {
      crashState = read
    },
    interleave: (at: number, effect: Effect.Effect<void>) => {
      interleave = { at, effect }
    },
    // Starts the interleaved effect if the join finished before reaching it,
    // then gives it a moment to finish. Whatever is still waiting by then is
    // waiting for the reload, and is stopped.
    settle: start.pipe(
      Effect.andThen(
        Effect.suspend(() =>
          fibers.length === 0
            ? Effect.void
            : Effect.sleep("200 millis").pipe(
                Effect.andThen(Fiber.interruptAll(fibers)),
              ),
        ),
      ),
    ),
    crashed: () => crashed,
  }
}

type Faults = ReturnType<typeof makeFaults>

const faultyKvs = (
  faults: Faults,
  kvs: KeyValueStore.KeyValueStore,
): KeyValueStore.KeyValueStore => {
  const fail = (method: string, key: string) => (cause: unknown) =>
    new KeyValueStore.KeyValueStoreError({
      method,
      key,
      message: "injected failure",
      cause,
    })
  return KeyValueStore.makeStringOnly({
    get: kvs.get,
    size: kvs.size,
    set: (key, value) =>
      faults
        .step(`set ${key}`, fail("set", key))
        .pipe(Effect.andThen(kvs.set(key, value))),
    remove: (key) =>
      faults
        .step(`remove ${key}`, fail("remove", key))
        .pipe(Effect.andThen(kvs.remove(key))),
    clear: faults
      .step("clear", fail("clear", ""))
      .pipe(Effect.andThen(kvs.clear)),
  })
}

// The journal can be destroyed through the EventLog or directly; either way
// it is one step.
const destroyStep = (faults: Faults) =>
  faults.step(
    "destroy journal",
    (cause) => new EventJournal.EventJournalError({ method: "destroy", cause }),
  )

const faultyLog = (
  faults: Faults,
  log: EventLog.EventLog["Service"],
): EventLog.EventLog["Service"] => ({
  ...log,
  destroy: destroyStep(faults).pipe(Effect.andThen(log.destroy)),
})

const faultyJournal = (
  faults: Faults,
  journal: EventJournal.EventJournal["Service"],
): EventJournal.EventJournal["Service"] => ({
  ...journal,
  destroy: destroyStep(faults).pipe(Effect.andThen(journal.destroy)),
})

const faultyDatabase = (
  faults: Faults,
  db: IndexedDbDatabase.IndexedDbDatabase["Service"],
): IndexedDbDatabase.IndexedDbDatabase["Service"] =>
  IndexedDbDatabase.IndexedDbDatabase.of({
    ...db,
    rebuild: faults
      .step(
        "rebuild database",
        (cause) =>
          new IndexedDbDatabase.IndexedDbDatabaseError({
            reason: "TransactionError",
            cause,
          }),
      )
      .pipe(Effect.andThen(db.rebuild)),
  })

interface JoinRun {
  readonly oldIdentity: string
  readonly newIdentity: string
  readonly ops: ReadonlyArray<string>
  readonly exit: Exit.Exit<void, unknown>
  readonly before: DeviceState
  readonly crashed: DeviceState | undefined
  readonly after: DeviceState
  // The identity a tab that launched during the join came up with, if it got
  // that far.
  readonly launched: Option.Option<string>
  readonly kvs: KeyValueStore.KeyValueStore
}

// One device with a recipe written through the real Recipes handlers, on its
// old identity and server, then a join to a new collection with the
// `failAt`-th storage write failing.
//
// `during` starts something else just before the join's `at`-th write, or
// after the join returns when it makes fewer, and lets it run alongside:
//
// - "write": the old EventLog writes another recipe, like a remote handler,
//   a timer or another tab that is still running.
// - "launch": another tab starts up and loads its identity.
const runJoin = (options: {
  readonly failAt: number | undefined
  readonly identity?: (newIdentity: string) => string
  readonly during?: {
    readonly at: number
    readonly run: "write" | "launch"
  }
}): Promise<JoinRun> => {
  const factory = makeFactory()
  return Effect.gen(function* () {
    const oldIdentity = yield* testIdentity
    const newIdentity = EventLog.encodeIdentityString(yield* testIdentity)
    const kvs = yield* KeyValueStore.KeyValueStore
    const stored = settings(kvs)
    yield* stored.identity.set(
      identityKey,
      EventLog.encodeIdentityString(oldIdentity),
    )
    yield* stored.serverUrl.set(syncServerUrlKey, oldServerUrl)
    yield* stored.enabled.set(syncEnabledKey, false)
    yield* kvs.set(mealPlanWeekStartCacheKey, '{"_tag":"Some","value":1}')
    yield* kvs.set(groceryCurrentListKey, '"Party"')
    yield* kvs.set(recipeSortByKey, '"title"')

    const eventLog = EventLog.layer(CheffectRecipes, RecipesLayer).pipe(
      Layer.provideMerge(layerJournal),
      Layer.provide(Layer.succeed(EventLog.Identity, oldIdentity)),
      Layer.provide(Layer.succeed(EventLog.CurrentStoreId, storeId)),
    )
    const context = yield* Layer.build(
      eventLog.pipe(
        Layer.provideMerge(QueryBuilder.layer),
        Layer.provideMerge(layerDatabase),
        Layer.provideMerge(Reactivity.layer),
        Layer.provideMerge(
          Layer.succeed(
            IndexedDb.IndexedDb,
            IndexedDb.make({ indexedDB: factory.indexedDB, IDBKeyRange }),
          ),
        ),
      ),
    )
    yield* Context.get(context, EventLog.EventLog).write({
      schema: CheffectRecipes,
      event: RecipeEvent.tag,
      payload: RecipeEvent.set(sampleRecipe),
    })

    const before = yield* readState(factory, kvs)
    const faults = makeFaults(options.failAt)
    faults.onCrash(readState(factory, kvs))
    let launched: Option.Option<string> = Option.none()
    if (options.during?.run === "write") {
      // Whether the write is refused doesn't matter, only what it leaves.
      faults.interleave(
        options.during.at,
        Context.get(context, EventLog.EventLog)
          .write({
            schema: CheffectRecipes,
            event: RecipeEvent.tag,
            payload: RecipeEvent.set({ ...sampleRecipe, id: lateRecipeId }),
          })
          .pipe(Effect.ignore),
      )
    } else if (options.during?.run === "launch") {
      faults.interleave(
        options.during.at,
        loadOrCreateIdentity.pipe(
          Effect.map((identity) => {
            launched = Option.some(EventLog.encodeIdentityString(identity))
          }),
          Effect.provideService(KeyValueStore.KeyValueStore, kvs),
          Effect.provide(EventLogEncryption.layerSubtle),
          Effect.ignore,
        ),
      )
    }

    const identity = options.identity?.(newIdentity) ?? newIdentity
    const exit = yield* join({ identity, serverUrl: newServerUrl }).pipe(
      Effect.provideService(
        EventLog.EventLog,
        faultyLog(faults, Context.get(context, EventLog.EventLog)),
      ),
      Effect.provideService(
        EventJournal.EventJournal,
        faultyJournal(faults, Context.get(context, EventJournal.EventJournal)),
      ),
      Effect.provideService(
        IndexedDbDatabase.IndexedDbDatabase,
        faultyDatabase(
          faults,
          Context.get(context, IndexedDbDatabase.IndexedDbDatabase),
        ),
      ),
      Effect.provideService(
        KeyValueStore.KeyValueStore,
        faultyKvs(faults, kvs),
      ),
      Effect.provideContext(context),
      Effect.timeout("5 seconds"),
      Effect.exit,
    )
    yield* faults.settle

    return {
      oldIdentity: EventLog.encodeIdentityString(oldIdentity),
      newIdentity: identity,
      ops: faults.ops.slice(),
      exit,
      before,
      crashed: faults.crashed(),
      after: yield* readState(factory, kvs),
      launched,
      kvs,
    }
  }).pipe(
    Effect.scoped,
    Effect.provide([KeyValueStore.layerMemory, EventLogEncryption.layerSubtle]),
    Effect.runPromise,
  )
}

test("a completed join wipes the device, clears the collection's keys and switches identity, server and sync", async () => {
  const run = await runJoin({ failAt: undefined })

  assert.ok(Exit.isSuccess(run.exit), `the join failed: ${String(run.exit)}`)
  assert.equal(run.before.recipes, 1, "the old recipe is on disk to begin with")
  assert.ok(
    typeof run.before.entries === "number" && run.before.entries > 0,
    "the old entries are in the journal to begin with",
  )
  assert.deepEqual(
    run.after,
    { identity: Option.some(run.newIdentity), recipes: 0, entries: 0 },
    "the wipe has finished, journal included, by the time the join returns",
  )

  const result = await Effect.gen(function* () {
    const stored = settings(run.kvs)
    return {
      serverUrl: yield* stored.serverUrl.get(syncServerUrlKey),
      enabled: yield* stored.enabled.get(syncEnabledKey),
      weekStartCache: yield* run.kvs.get(mealPlanWeekStartCacheKey),
      groceryList: yield* run.kvs.get(groceryCurrentListKey),
      sortBy: yield* run.kvs.get(recipeSortByKey),
      // the next launch picks up the joined identity
      launched: (yield* loadOrCreateIdentity).publicKey,
    }
  }).pipe(
    Effect.provideService(KeyValueStore.KeyValueStore, run.kvs),
    Effect.provide(EventLogEncryption.layerSubtle),
    Effect.runPromise,
  )
  assert.deepEqual(result, {
    serverUrl: Option.some(newServerUrl),
    enabled: Option.some(true),
    weekStartCache: undefined,
    groceryList: undefined,
    sortBy: '"title"',
    launched: EventLog.decodeIdentityString(run.newIdentity).publicKey,
  })
})

test("a join that dies at any storage step never leaves the new identity next to old data", async () => {
  const complete = await runJoin({ failAt: undefined })
  assert.ok(Exit.isSuccess(complete.exit), String(complete.exit))

  // One run per write the complete join made, failing that write.
  for (let failAt = 0; failAt < complete.ops.length; failAt++) {
    const op = complete.ops[failAt]
    const run = await runJoin({ failAt })
    assert.ok(
      Exit.isFailure(run.exit),
      `the join carried on after "${op}" failed`,
    )
    assert.ok(run.crashed, `step ${failAt} ("${op}") was never reached`)
    // a crash: the device as it stood when the step failed
    assertSafe(run.crashed!, {
      oldIdentity: run.oldIdentity,
      when: `crash at "${op}"`,
    })
    // an error: the device once the join has given up
    assertSafe(run.after, {
      oldIdentity: run.oldIdentity,
      when: `after "${op}" failed`,
    })
  }
})

// Effect's EventLog makes every local write and every remote replay under the
// journal's Web Lock, which every tab shares; the identity loads under its own
// Web Lock. The join has to hold both until the page reloads.

test("a write from the old collection during the join never lands next to the new identity", async () => {
  const complete = await runJoin({ failAt: undefined })
  assert.ok(Exit.isSuccess(complete.exit), String(complete.exit))

  for (let at = 0; at <= complete.ops.length; at++) {
    const when = complete.ops[at] ?? "the reload"
    const run = await runJoin({
      failAt: undefined,
      during: { at, run: "write" },
    })
    assert.ok(Exit.isSuccess(run.exit), `${when}: ${String(run.exit)}`)
    assertSafe(run.after, {
      oldIdentity: run.oldIdentity,
      when: `old write starting before "${when}"`,
    })
  }
})

test("a tab that launches during the join never comes up on the old identity", async () => {
  const complete = await runJoin({ failAt: undefined })
  assert.ok(Exit.isSuccess(complete.exit), String(complete.exit))

  for (let at = 0; at <= complete.ops.length; at++) {
    const when = complete.ops[at] ?? "the reload"
    const run = await runJoin({
      failAt: undefined,
      during: { at, run: "launch" },
    })
    assert.ok(Exit.isSuccess(run.exit), `${when}: ${String(run.exit)}`)
    assert.notEqual(
      Option.getOrUndefined(run.launched),
      run.oldIdentity,
      `a tab launching before "${when}" loaded the old identity`,
    )
  }
})

// The WebSocket constructor throws on any fragment, an empty one included, so
// such a server could never connect. A share link carrying one would wipe the
// device and leave it unable to sync.
test("a server URL with a fragment is refused, in Settings and in share links", async () => {
  const identity = EventLog.encodeIdentityString(
    await Effect.runPromise(testIdentity),
  )
  for (const serverUrl of [
    "wss://sync.example.com/sync#frag",
    "wss://sync.example.com/sync#",
  ]) {
    assert.deepEqual(
      parseSyncServerUrl(serverUrl),
      Option.none(),
      `Settings saved ${serverUrl}`,
    )
    const link = makeShareLink({
      appUrl: "https://cheffect.example.com/",
      identity,
      serverUrl,
    })
    assert.deepEqual(
      parseJoinInput(link),
      Option.none(),
      `a share link with ${serverUrl} was accepted`,
    )
  }
})

test("an invalid sync key wipes nothing and keeps the old identity", async () => {
  const run = await runJoin({
    failAt: undefined,
    identity: () => "not-a-sync-key",
  })
  assert.ok(Exit.isFailure(run.exit), "the invalid key was accepted")
  assert.deepEqual(run.ops, [], "the invalid key touched storage")
  assert.deepEqual(run.after, run.before)
})

test("share links carry the key and the server URL in the fragment, and the paste box takes either a link or a bare key", async () => {
  const identity = EventLog.encodeIdentityString(
    await Effect.runPromise(testIdentity),
  )
  const serverUrl = "wss://sync.example.com/sync?x=1&y=2"
  const link = makeShareLink({
    appUrl: "https://cheffect.example.com/recipes/abc?q=1",
    identity,
    serverUrl,
  })

  const url = new URL(link)
  assert.equal(url.origin, "https://cheffect.example.com")
  assert.equal(url.pathname, "/")
  assert.equal(url.search, "", "nothing secret reaches the server")
  const fragment = new URLSearchParams(url.hash.slice(1))
  assert.equal(fragment.get("join"), identity)
  assert.equal(fragment.get("server"), serverUrl)

  assert.deepEqual(
    parseJoinInput(link),
    Option.some({ identity, serverUrl: Option.some(serverUrl) }),
  )
  assert.deepEqual(
    parseJoinInput(`  ${identity}\n`),
    Option.some({ identity, serverUrl: Option.none() }),
  )
  for (const invalid of [
    "not-a-sync-key",
    "https://cheffect.example.com/#join=not-a-sync-key&server=wss%3A%2F%2Fx",
  ]) {
    assert.deepEqual(
      parseJoinInput(invalid),
      Option.none(),
      JSON.stringify(invalid),
    )
  }
})
