/**
 * Port of `AtomLivestore` from `@effect-atom/atom-livestore`, which only
 * supports Effect 3. Only the parts cheffect uses are included.
 */
import type {
  CreateStoreOptions,
  LiveQueryDef,
  LiveStoreSchema,
  OtelOptions,
  Store,
} from "@livestore/livestore"
import { createStore, provideOtel } from "@livestore/livestore"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { constUndefined } from "effect/Function"
import * as Layer from "effect/Layer"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

/**
 * Waits until the leader thread has confirmed every event committed by this
 * client session. The leader writes events to its eventlog and state database
 * before confirming them.
 *
 * This polls `syncStatus()`, because `syncStatusStream()` reads from a queue
 * that is never drained, so it can replay stale states.
 */
const awaitPersisted = Effect.fnUntraced(function* (store: Store<any, any>) {
  while (!store.syncStatus().isSynced) {
    yield* Effect.sleep(10)
  }
})

export interface AtomLiveStore<
  Self,
  Id extends string,
  S extends LiveStoreSchema,
  C = {},
> extends Context.ServiceClass<Self, Id, Store<S, C>> {
  readonly layer: Atom.Atom<Layer.Layer<Self>>
  readonly runtime: Atom.AtomRuntime<Self>

  /**
   * The Store, or the error raised while creating it.
   */
  readonly store: Atom.Atom<AsyncResult.AsyncResult<Store<S, C>>>
  /**
   * The Store, or `undefined` until it has been created.
   */
  readonly storeUnsafe: Atom.Atom<Store<S, C> | undefined>
  /**
   * Resolves a LiveQueryDef once the Store has been created.
   */
  readonly makeQuery: <A>(
    query: LiveQueryDef<A> | ((get: Atom.AtomContext) => LiveQueryDef<A>),
  ) => Atom.Atom<AsyncResult.AsyncResult<A>>
  /**
   * Resolves a LiveQueryDef, or `undefined` until the Store has been created.
   */
  readonly makeQueryUnsafe: <A>(
    query: LiveQueryDef<A> | ((get: Atom.AtomContext) => LiveQueryDef<A>),
  ) => Atom.Atom<A | undefined>
  /**
   * Commits an event to the Store.
   */
  readonly commit: Atom.Writable<void, {}>
  /**
   * Commits an event to the Store and resolves once the leader thread has
   * persisted it. Use this when the page may unload straight after the commit
   * (full page navigation, reload), otherwise the event can be lost.
   */
  readonly commitPersisted: Atom.AtomResultFn<{}, void>
}

export type Options<S extends LiveStoreSchema, C = {}> = CreateStoreOptions<
  S,
  C
> & {
  readonly otelOptions?: Partial<OtelOptions> | undefined
}

export const Tag =
  <Self>() =>
  <const Id extends string, S extends LiveStoreSchema, C = {}>(
    id: Id,
    options: Options<S, C> | ((get: Atom.AtomContext) => Options<S, C>),
  ): AtomLiveStore<Self, Id, S, C> => {
    const tag = Context.Service<Self, Store<S, C>>()(id)

    const layerFromOptions = (opts: Options<S, C>) =>
      Layer.effect(
        tag,
        createStore(opts).pipe(
          provideOtel({
            parentSpanContext: opts.otelOptions?.rootSpanContext,
            otelTracer: opts.otelOptions?.tracer,
          }),
          Effect.orDie,
        ),
      )

    const runtime = Atom.runtime(
      typeof options === "function"
        ? (get) => layerFromOptions(options(get))
        : layerFromOptions(options),
    )
    const store = runtime.atom(Effect.service(tag))
    const storeUnsafe = Atom.readable((get) =>
      AsyncResult.getOrElse(get(store), constUndefined),
    )

    const makeQuery = <A>(
      query: LiveQueryDef<A> | ((get: Atom.AtomContext) => LiveQueryDef<A>),
    ) =>
      Atom.readable((get): AsyncResult.AsyncResult<A> =>
        AsyncResult.map(get(store), (store) => {
          const q = typeof query === "function" ? query(get) : query
          get.addFinalizer(
            store.subscribe(q, (value) =>
              get.setSelf(AsyncResult.success(value)),
            ),
          )
          return store.query(q)
        }),
      )

    const makeQueryUnsafe = <A>(
      query: LiveQueryDef<A> | ((get: Atom.AtomContext) => LiveQueryDef<A>),
    ) =>
      Atom.readable((get): A | undefined => {
        const current = get(storeUnsafe)
        if (current === undefined) {
          return undefined
        }
        const q = typeof query === "function" ? query(get) : query
        get.addFinalizer(current.subscribe(q, (value) => get.setSelf(value)))
        return current.query(q)
      })

    const commit = Atom.writable(
      (get) => {
        get(storeUnsafe)
      },
      (ctx, value: {}) => {
        ctx.get(storeUnsafe)?.commit(value)
      },
    )

    const commitPersisted = runtime.fn<{}>()(
      Effect.fnUntraced(function* (value) {
        const store = yield* tag
        store.commit(value)
        yield* awaitPersisted(store)
      }),
      { concurrent: true },
    )

    return Object.assign(tag, {
      runtime,
      layer: runtime.layer,
      store,
      storeUnsafe,
      makeQuery,
      makeQueryUnsafe,
      commit,
      commitPersisted,
    })
  }
