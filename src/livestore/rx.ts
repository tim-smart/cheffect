import { Rx } from "@effect-rx/rx-react"
import { LiveQueryDef, Store } from "@livestore/livestore"
import { schema } from "./schema"

export const liveStoreRx = Rx.make<Store<typeof schema>>(null as any).pipe(
  Rx.keepAlive,
)

export const queryRx = Rx.family(
  <A>(query: LiveQueryDef<A>): Rx.Rx<A> =>
    Rx.readable((get) => {
      const store = get(liveStoreRx)
      const result = store.query(query)
      get.addFinalizer(
        store.subscribe(query, {
          onUpdate(value) {
            get.setSelf(value)
          },
        }),
      )
      return result
    }),
)
