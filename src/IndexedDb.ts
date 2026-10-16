import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as IndexedDbDatabase from "@effect/platform-browser/IndexedDbDatabase"
import type * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"
import * as IndexedDbVersion from "@effect/platform-browser/IndexedDbVersion"
import { RecipeExtractJobsTable } from "./RecipeExtractJobs/Table"

export const databaseName = "cheffect"

// One database, one version. Nothing has shipped on this schema, so module
// stages add their tables and indexes to V1 and its migration rather than
// adding a V2.
export class V1 extends IndexedDbVersion.make(RecipeExtractJobsTable) {}

export class Database extends IndexedDbDatabase.make(
  V1,
  Effect.fn(function* (api) {
    yield* api.createObjectStore("recipeExtractJobs")
  }),
) {}

export type TableName = IndexedDbTable.TableName<
  IndexedDbVersion.Tables<typeof V1>
>
export type RowOf<Name extends TableName> = IndexedDbVersion.SchemaWithName<
  typeof V1,
  Name
>["Type"]

export const tableNames: ReadonlyArray<TableName> = Array.from(
  V1.tables.keys(),
) as Array<TableName>

// The database without any browser wiring, for tests and tools.
export const layerDatabase = Database.layer(databaseName)

export class QueryBuilder extends Context.Service<QueryBuilder>()(
  "cheffect/IndexedDb/QueryBuilder",
  { make: Database.getQueryBuilder },
) {
  static readonly layer = Layer.effect(this, this.make)
}

// Tab coordination
//
// Another tab opening a newer version (or rebuilding the database) sends this
// tab `versionchange`; the connection closes and the tab reloads so it never
// holds an old schema open. If this tab is the one that's blocked, it shows
// the "close other tabs" screen and keeps probing until the upgrade can go
// through, then reloads itself into a clean state.

let databaseBlocked = false
const blockedListeners = new Set<(blocked: boolean) => void>()

export const setDatabaseBlocked = (blocked: boolean) => {
  if (databaseBlocked === blocked) return
  databaseBlocked = blocked
  for (const listener of blockedListeners) listener(blocked)
}

export const databaseBlockedAtom = Atom.make((get) => {
  const listener = (blocked: boolean) => get.setSelf(blocked)
  blockedListeners.add(listener)
  get.addFinalizer(() => {
    blockedListeners.delete(listener)
  })
  return databaseBlocked
}).pipe(Atom.keepAlive)

const reload = () => {
  window.location.reload()
}

const isBlocked = (error: IndexedDbDatabase.IndexedDbDatabaseError) =>
  error.reason === "Blocked"

const closeAndReloadOnVersionChange = (
  db: IndexedDbDatabase.IndexedDbDatabase["Service"],
) =>
  Effect.sync(() => {
    const connection = db.database.current
    connection.onversionchange = () => {
      connection.close()
      reload()
    }
  })

const probeInterval = "1 second"

export const layerIndexedDb: Layer.Layer<
  IndexedDbDatabase.IndexedDbDatabase | IndexedDb.IndexedDb,
  IndexedDbDatabase.IndexedDbDatabaseError
> = Layer.effect(
  IndexedDbDatabase.IndexedDbDatabase,
  Effect.gen(function* () {
    const open = Layer.build(layerDatabase).pipe(
      Effect.map((context) =>
        Context.get(context, IndexedDbDatabase.IndexedDbDatabase),
      ),
    )

    const inner = yield* open.pipe(
      Effect.catchIf(isBlocked, () =>
        Effect.gen(function* () {
          setDatabaseBlocked(true)
          let stillBlocked = true
          while (stillBlocked) {
            yield* Effect.sleep(probeInterval)
            stillBlocked = yield* Effect.scoped(open).pipe(
              Effect.as(false),
              Effect.catchIf(isBlocked, () => Effect.succeed(true)),
            )
          }
          // The blocked open request may still complete and leave a stray
          // connection behind, so start over rather than reuse this tab.
          reload()
          return yield* Effect.never
        }),
      ),
    )
    yield* closeAndReloadOnVersionChange(inner)

    // `deleteDatabase` only reports "blocked" as a delay, so show the screen
    // when a rebuild takes longer than one probe interval.
    const rebuild = Effect.gen(function* () {
      const timer = yield* Effect.forkChild(
        Effect.sleep(probeInterval).pipe(
          Effect.andThen(Effect.sync(() => setDatabaseBlocked(true))),
        ),
      )
      yield* inner.rebuild.pipe(
        Effect.ensuring(
          Fiber.interrupt(timer).pipe(
            Effect.andThen(Effect.sync(() => setDatabaseBlocked(false))),
          ),
        ),
      )
      yield* closeAndReloadOnVersionChange(inner)
    })

    return IndexedDbDatabase.IndexedDbDatabase.of({ ...inner, rebuild })
  }),
).pipe(Layer.provideMerge(IndexedDb.layerWindow))
