import { Timer } from "@/domain/Timer"
import { Store } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Atom, Result } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"

export const activeTimers$ = queryDb({
  query: sql`select * from timers where dismissed = false order by createdAt asc`,
  schema: Timer.array,
})

export const activeTimersAtom = Store.makeQuery(activeTimers$).pipe(
  Atom.map(Result.getOrElse(Array.empty<Timer>)),
)

export const dismissTimerAtom = Store.runtime.fn<string>()(
  Effect.fnUntraced(function* (timerId) {
    const store = yield* Store
    store.commit(events.timerDeleted({ id: timerId }))
  }),
)

export const toggleTimerAtom = Store.runtime.fn<Timer>()(
  Effect.fnUntraced(function* (timer) {
    const store = yield* Store
    store.commit(
      events.timerUpdate(
        timer.pausedRemaining ? timer.resume() : timer.pause(),
      ),
    )
  }),
)
