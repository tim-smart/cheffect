import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as PubSub from "effect/PubSub"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import { StoreId } from "effect/eventlog/EventLogMessage"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as RpcClient from "effect/rpc/RpcClient"
import * as RpcSerialization from "effect/rpc/RpcSerialization"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as BrowserSocket from "@effect/platform-browser/BrowserSocket"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import { IndexedDbQueryError } from "@effect/platform-browser/IndexedDbQueryBuilder"
import { useAtomSet } from "@effect/atom-react"
import { kvsRuntime } from "./lib/atom"
import { AiChatEvents } from "./AiChat/Events"
import { AiChatLayer } from "./AiChat/Handlers"
import { GroceriesLayer } from "./Groceries"
import { GroceryEvents } from "./Groceries/Events"
import { MealPlanLayer } from "./MealPlan"
import { MealPlanEvents } from "./MealPlan/Events"
import { MenusLayer } from "./Menus"
import { MenuEvents } from "./Menus/Events"
import { RecipesLayer } from "./Recipes"
import { RecipeEvents } from "./Recipes/Events"
import { SettingsLayer } from "./Settings/Handlers"
import { SettingsEvents } from "./Settings/Events"
import { TimersLayer } from "./Timers"
import { TimerEvents } from "./Timers/Events"
import { withWebLock } from "./lib/WebLock"
import {
  QueryBuilder,
  type TableName,
  layerIndexedDb,
  setDatabaseBlocked,
  tableNames,
} from "./IndexedDb"

// Events
//
// One EventGroup per module, with its handlers provided by `EventLogLayer`.

export const CheffectEvents = EventLog.schema(
  RecipeEvents,
  SettingsEvents,
  TimerEvents,
  MealPlanEvents,
  MenuEvents,
  GroceryEvents,
  AiChatEvents,
)

export type EventPayload =
  (typeof CheffectEvents.groups)[number] extends EventGroup.EventGroup<
    infer _Event
  >
    ? _Event extends Event.Event<
        infer _Tag,
        infer _Payload,
        infer _Success,
        infer _Error
      >
      ? {
          readonly event: _Tag
          readonly payload: _Payload["Type"]
        }
      : never
    : never

// Journal and store
//
// The journal database is named explicitly because its name is also the Web
// Lock prefix, and the durability barrier opens it by name. `CurrentStoreId`
// goes to the sync server in plaintext, so it is a fixed value and never the
// identity.

export const journalDatabaseName = "cheffect_events"

export const storeId: StoreId = StoreId.make("default")

// Identity, server URL and Enable Sync
//
// All three use schema-backed settings in localStorage. The identity lives under
// `cheffect:identity`, generated on the first launch before the EventLog
// layer builds. Whoever has it can read and write all data; Settings shows
// it masked, as the "Sync key".

export const identityKey = "cheffect:identity"
export const syncServerUrlKey = "cheffect:syncServerUrl"
export const syncEnabledKey = "cheffect:syncEnabled"

export const loadOrCreateIdentity: Effect.Effect<
  EventLog.Identity["Service"],
  KeyValueStore.KeyValueStoreError | Schema.SchemaError,
  KeyValueStore.KeyValueStore | EventLogEncryption.EventLogEncryption
> = withWebLock(
  identityKey,
  Effect.gen(function* () {
    // Read inside the lock: another tab may have initialized while we waited.
    const kvs = KeyValueStore.toSchemaStore(
      yield* KeyValueStore.KeyValueStore,
      Schema.String,
    )
    const stored = yield* kvs.get(identityKey)
    if (Option.isSome(stored)) {
      return EventLog.decodeIdentityString(stored.value)
    }
    const identity = yield* EventLog.makeIdentity
    yield* kvs.set(identityKey, EventLog.encodeIdentityString(identity))
    return identity
  }),
)

const IdentityLayer = Layer.effect(
  EventLog.Identity,
  loadOrCreateIdentity,
).pipe(
  Layer.provide([
    BrowserKeyValueStore.layerLocalStorage,
    EventLogEncryption.layerSubtle,
  ]),
)

// Initialization completes before Atom.kvs reads, so it never generates or
// persists a competing default identity. Changing the setting takes effect on
// the next launch, before EventLog is built.
const identitySettingsRuntime = Atom.runtime(
  IdentityLayer.pipe(
    Layer.provideMerge(BrowserKeyValueStore.layerLocalStorage),
  ),
)

export const identityAtom = Atom.kvs({
  runtime: identitySettingsRuntime,
  key: identityKey,
  schema: Schema.String,
  mode: "async",
  defaultValue: (): string => {
    throw new Error("Identity setting missing after initialization")
  },
})

export const syncServerUrlAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: syncServerUrlKey,
  schema: Schema.OptionFromNullishOr(Schema.String, undefined),
  defaultValue: Option.none,
})

export const syncEnabledAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: syncEnabledKey,
  schema: Schema.Boolean,
  defaultValue: () => false,
})

// The URL to connect to, or none. Sync needs both the toggle and a URL, so a
// first launch never touches the network. A blank setting falls back to
// `defaultUrl`. `http(s)` is accepted and mapped to `ws(s)`; otherwise the URL
// is used as typed.
export const resolveSyncUrl = (options: {
  readonly enabled: boolean
  readonly url: Option.Option<string>
  readonly defaultUrl?: Option.Option<string>
}): Option.Option<string> => {
  if (!options.enabled) return Option.none()
  const url = options.url.pipe(
    Option.map((url) => url.trim()),
    Option.filter((url) => url !== ""),
    Option.orElse(() => options.defaultUrl ?? Option.none()),
  )
  return Option.map(url, (url) => url.replace(/^http(s?):/i, "ws$1:"))
}

// Only the combined Docker image sets `VITE_SYNC_SAME_ORIGIN`: its sync server
// is on the same origin as the app, at `/sync`. Outside Vite (node tests)
// `import.meta.env` is undefined.
export const defaultSyncServerUrl = (): Option.Option<string> =>
  import.meta.env?.VITE_SYNC_SAME_ORIGIN === "true"
    ? Option.some(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/sync`,
      )
    : Option.none()

// The server this device syncs with once sync is on: the setting, or the
// default. Share links carry it, and Enable Sync needs one.
export const serverUrlAtom = Atom.make((get) =>
  resolveSyncUrl({
    enabled: true,
    url: get(syncServerUrlAtom),
    defaultUrl: defaultSyncServerUrl(),
  }),
)

export const syncUrlAtom = Atom.make((get) =>
  get(syncEnabledAtom) ? get(serverUrlAtom) : Option.none(),
)

const syncServerProtocols = new Set(["ws:", "wss:", "http:", "https:"])

// A server URL as typed into Settings or carried by a share link: `ws(s)`, or
// `http(s)` mapped to `ws(s)`. Anything else isn't a sync server.
export const parseSyncServerUrl = (input: string): Option.Option<string> => {
  const trimmed = input.trim()
  // URL.hash is empty for a trailing bare #, but WebSocket rejects that too.
  if (trimmed.includes("#")) return Option.none()
  return Option.liftThrowable((url: string) => new URL(url))(trimmed).pipe(
    Option.filter(
      (url) => syncServerProtocols.has(url.protocol) && url.host !== "",
    ),
    Option.map(() => trimmed.replace(/^http(s?):/i, "ws$1:")),
  )
}

// Journal
//
// Effect's IndexedDB journal, except for how it writes local entries and that
// `destroy` waits for the deletion.
//
// Effect's `write` commits each entry in its own transaction. Here
// `JournalBatch` commits a batch of entries in one, and `write` is a batch of
// one, so both publish to the `changes` the remotes upload from. Entries in a
// batch get ascending ids, so every device orders them as they were written.
//
// Effect's own `destroy` only requests the deletion, and the journal's open
// connection holds it back until the page unloads. A join writes the new
// identity right after, so a crash in between would leave the old entries to
// upload into the joined collection. The connection gets its own scope so
// `destroy` can close it first. Another tab's journal can still hold the
// deletion back, so that shows the "close other tabs" screen.

export class JournalBatch extends Context.Service<
  JournalBatch,
  {
    // Runs the effect with the new entries, then commits them in one
    // transaction and publishes them, as `EventJournal.write` does for one.
    // The caller holds the lock.
    readonly write: <A, E, R>(options: {
      readonly entries: Arr.NonEmptyReadonlyArray<{
        readonly event: string
        readonly primaryKey: string
        readonly payload: Uint8Array
      }>
      readonly effect: (
        entries: Arr.NonEmptyReadonlyArray<EventJournal.Entry>,
      ) => Effect.Effect<A, E, R>
    }) => Effect.Effect<A, EventJournal.EventJournalError | E, R>
    readonly withLock: EventJournal.EventJournal["Service"]["withLock"]
  }
>()("cheffect/EventLog/JournalBatch") {}

const deleteJournal = Effect.callback<void, EventJournal.EventJournalError>(
  (resume) => {
    const request = indexedDB.deleteDatabase(journalDatabaseName)
    request.onblocked = () => setDatabaseBlocked(true)
    request.onsuccess = () => {
      setDatabaseBlocked(false)
      resume(Effect.void)
    }
    request.onerror = () => {
      setDatabaseBlocked(false)
      resume(
        Effect.fail(
          new EventJournal.EventJournalError({
            method: "destroy",
            cause: request.error,
          }),
        ),
      )
    }
  },
)

const encodeEntry = Schema.encodeSync(EventJournal.Entry)

const putEntries = (entries: ReadonlyArray<EventJournal.Entry>) =>
  Effect.tryPromise({
    try: () =>
      openJournal(indexedDB).then(
        (connection) =>
          new Promise<void>((resolve, reject) => {
            const transaction = connection.transaction("entries", "readwrite")
            const store = transaction.objectStore("entries")
            for (const entry of entries) store.put(encodeEntry(entry))
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error)
            transaction.onabort = () => reject(transaction.error)
          }),
      ),
    catch: (cause) =>
      new EventJournal.EventJournalError({ method: "write", cause }),
  })

export const layerJournal: Layer.Layer<
  EventJournal.EventJournal | JournalBatch,
  EventJournal.EventJournalError
> = Layer.effectContext(
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
    const journal = yield* EventJournal.makeIndexedDb({
      database: journalDatabaseName,
    }).pipe(Scope.provide(scope))
    const changes = yield* PubSub.unbounded<EventJournal.Entry>()

    const write: JournalBatch["Service"]["write"] = ({ entries, effect }) =>
      Effect.uninterruptibleMask((restore) => {
        const ids = entries
          .map(() => EventJournal.makeEntryIdUnsafe())
          .sort(EventJournal.EntryIdOrder)
        const written = Arr.map(
          entries,
          (entry, i) =>
            new EventJournal.Entry(
              { ...entry, id: ids[i] },
              { disableChecks: true },
            ),
        )
        return restore(effect(written)).pipe(
          Effect.tap(putEntries(written)),
          Effect.tap(PubSub.publishAll(changes, written)),
        )
      })

    return Context.make(
      EventJournal.EventJournal,
      EventJournal.EventJournal.of({
        ...journal,
        write: ({ effect, ...entry }) =>
          write({ entries: [entry], effect: ([written]) => effect(written) }),
        changes: PubSub.subscribe(changes),
        destroy: Scope.close(scope, Exit.void).pipe(
          Effect.andThen(deleteJournal),
        ),
      }),
    ).pipe(
      Context.add(
        JournalBatch,
        JournalBatch.of({ write, withLock: journal.withLock }),
      ),
    )
  }),
)

// Layers and atoms

const EventLogLayer = EventLog.layer(
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
  Layer.provideMerge(layerJournal),
  Layer.provide(Layer.succeed(EventLog.CurrentStoreId, storeId)),
)

const makeClient = EventLog.makeClient(CheffectEvents)

export class EventLogClient extends Context.Service<
  EventLogClient,
  Effect.Success<typeof makeClient>
>()("cheffect/EventLog/EventLogClient") {
  static readonly layer = Layer.effect(EventLogClient, makeClient)
}

export const eventLogAtom = Atom.runtime(
  EventLogClient.layer.pipe(
    Layer.provideMerge(EventLogLayer),
    Layer.provideMerge(IdentityLayer),
    Layer.provideMerge(QueryBuilder.layer),
    Layer.provideMerge(layerIndexedDb),
    Layer.provideMerge(Reactivity.layer),
  ),
)

export const clientAtom = eventLogAtom.atom(EventLogClient)

export const remoteAtom = Atom.runtime((get) =>
  Effect.gen(function* () {
    const url = yield* get.some(syncUrlAtom)
    // The new remote is built before the old one is released, and the shared
    // MemoMap would hand the old one back, still on the old server. The
    // Registry stays shared so the remote registers with the EventLog.
    return Layer.fresh(EventLogRemote.layerEncrypted).pipe(
      Layer.provide(EventLog.layerRegistry),
      Layer.provide(
        RpcClient.layerProtocolSocket({ retryTransientErrors: true }),
      ),
      Layer.provide(RpcSerialization.layerSchemaBinary()),
      Layer.provide(BrowserSocket.layerWebSocket(url)),
    )
  }).pipe(Layer.unwrap),
)

// Durability barrier
//
// The journal entry and the handler's table writes commit separately, the
// latter in the `cheffect` database. A readonly transaction over the same
// stores can't start until those writes have committed, so waiting for one on
// each database means an awaited write is on disk before navigation or unload.

const journalConnections = new WeakMap<IDBFactory, Promise<IDBDatabase>>()

const openJournal = (indexedDB: IDBFactory): Promise<IDBDatabase> => {
  let pending = journalConnections.get(indexedDB)
  if (pending === undefined) {
    pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(journalDatabaseName, 1)
      request.onupgradeneeded = () => {
        // Only the journal layer creates its database.
        request.transaction?.abort()
        reject(new Error("the event journal database does not exist yet"))
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const connection = request.result
        connection.onversionchange = () => {
          connection.close()
          journalConnections.delete(indexedDB)
        }
        resolve(connection)
      }
    })
    journalConnections.set(indexedDB, pending)
    pending.catch(() => {
      journalConnections.delete(indexedDB)
    })
  }
  return pending
}

const awaitReadonly = (
  connection: IDBDatabase,
  stores: ReadonlyArray<string>,
) =>
  new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction(stores, "readonly")
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
    transaction.objectStore(stores[0]).openKeyCursor()
  })

const barrierError = (cause: unknown) =>
  new IndexedDbQueryError({ reason: "TransactionError", cause })

export const durabilityBarrier: Effect.Effect<
  void,
  IndexedDbQueryError,
  QueryBuilder | IndexedDb.IndexedDb
> = Effect.gen(function* () {
  const db = yield* QueryBuilder
  const { indexedDB } = yield* IndexedDb.IndexedDb
  yield* Effect.tryPromise({
    try: () => awaitReadonly(db.database.current, tableNames),
    catch: barrierError,
  })
  yield* Effect.tryPromise({
    try: () =>
      openJournal(indexedDB).then((c) => awaitReadonly(c, ["entries"])),
    catch: barrierError,
  })
})

// Writes
//
// Every write ends with the durability barrier, so there is no second
// "persisted" API to forget. Effects that write (atoms, the AI tools, the
// extraction manager, the dev seed) use `writeEvent`, or `writeEvents` for
// many at once; components use `useWrite()` and `useWriteEvents()`.

const writeUnbarriered = (
  payload: EventPayload,
): Effect.Effect<void, EventJournal.EventJournalError, EventLog.EventLog> =>
  EventLog.EventLog.use((_) =>
    _.write({ schema: CheffectEvents, ...payload } as any),
  )

export const writeEvent = (
  payload: EventPayload,
): Effect.Effect<
  void,
  EventJournal.EventJournalError | IndexedDbQueryError,
  EventLog.EventLog | QueryBuilder | IndexedDb.IndexedDb
> => writeUnbarriered(payload).pipe(Effect.andThen(durabilityBarrier))

// Batches
//
// `writeEvents` writes the same events, in the same order, as calling
// `writeEvent` on each, with one transaction for all their handlers, one for
// their journal entries and one durability barrier. If a handler fails, none
// of them are written. A journal without `JournalBatch` (Effect's own, in the
// node tests) writes them one at a time instead.

const invalidateEntries = (
  registry: EventLog.Registry["Service"],
  reactivity: Reactivity.Reactivity,
  entries: ReadonlyArray<EventJournal.Entry>,
) => {
  for (const entry of entries) {
    const keys = Object.hasOwn(registry.reactivityKeys, entry.event)
      ? registry.reactivityKeys[entry.event]
      : undefined
    if (keys === undefined) continue
    for (const key of keys) {
      reactivity.invalidateUnsafe({ [key]: [entry.primaryKey] })
    }
  }
}

const writeBatch = Effect.fnUntraced(function* (
  batch: JournalBatch["Service"],
  payloads: Arr.NonEmptyReadonlyArray<EventPayload>,
) {
  const registry = yield* EventLog.Registry
  const identity = yield* EventLog.Identity
  const reactivity = yield* Reactivity.Reactivity
  const db = yield* QueryBuilder
  const writes = yield* Effect.forEach(payloads, ({ event, payload }) => {
    const handler = registry.handlers.get(event)
    if (handler === undefined) {
      return Effect.die(`Event handler not found for: "${event}"`)
    }
    return Schema.encodeUnknownEffect(handler.event.payloadSchemaBinary)(
      payload,
    ).pipe(
      Effect.orDie,
      Effect.map((encoded) => ({
        handler,
        payload,
        entry: {
          event,
          primaryKey: handler.event.primaryKey(payload),
          payload: encoded as Uint8Array,
        },
      })),
    )
  })
  if (!Arr.isArrayNonEmpty(writes)) return
  yield* batch.withLock(storeId)(
    batch.write({
      entries: Arr.map(writes, (write) => write.entry),
      effect: (entries) =>
        Effect.forEach(
          entries,
          (entry, i) => {
            const { handler, payload } = writes[i]
            return handler
              .handler({ storeId, payload, entry, conflicts: [] })
              .pipe(
                Effect.updateContext((input) =>
                  Context.merge(handler.context, input),
                ),
                Effect.provideService(EventLog.Identity, identity),
              )
          },
          { discard: true },
        ).pipe(
          db.withTransaction({
            tables: tableNames as Arr.NonEmptyReadonlyArray<TableName>,
            mode: "readwrite",
          }),
          Effect.andThen(
            Effect.sync(() => invalidateEntries(registry, reactivity, entries)),
          ),
        ),
    }),
  )
})

export const writeEvents = (
  payloads: ReadonlyArray<EventPayload>,
): Effect.Effect<
  void,
  EventJournal.EventJournalError | IndexedDbQueryError,
  | EventLog.EventLog
  | EventLog.Registry
  | EventLog.Identity
  | Reactivity.Reactivity
  | QueryBuilder
  | IndexedDb.IndexedDb
> =>
  Effect.gen(function* () {
    if (!Arr.isReadonlyArrayNonEmpty(payloads)) return
    const batch = yield* Effect.serviceOption(JournalBatch)
    if (Option.isSome(batch)) {
      yield* writeBatch(batch.value, payloads) as Effect.Effect<
        void,
        EventJournal.EventJournalError | IndexedDbQueryError,
        any
      >
    } else {
      for (const payload of payloads) {
        yield* writeUnbarriered(payload)
      }
    }
    yield* durabilityBarrier
  })

export const writeEventAtom = eventLogAtom
  .fn<EventPayload>()(
    (payload) => writeEvent(payload).pipe(Effect.tapCause(Effect.logWarning)),
    { concurrent: true },
  )
  .pipe(Atom.keepAlive)

export const useWrite = () => useAtomSet(writeEventAtom, { mode: "promise" })

export const writeEventsAtom = eventLogAtom
  .fn<ReadonlyArray<EventPayload>>()(
    (payloads) =>
      writeEvents(payloads).pipe(Effect.tapCause(Effect.logWarning)),
    { concurrent: true },
  )
  .pipe(Atom.keepAlive)

export const useWriteEvents = () =>
  useAtomSet(writeEventsAtom, { mode: "promise" })
