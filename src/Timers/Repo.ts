import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { Timer } from "@/domain/Timer"
import { stripLww } from "@/lib/Lww"
import { makeSnapshot } from "@/lib/Snapshot"
import type { TimerRow } from "./Table"

// Active timers, oldest first. The id breaks ties so every device lists
// timers started in the same millisecond in the same order.
const decodeTimers = (rows: ReadonlyArray<TimerRow>): ReadonlyArray<Timer> =>
  rows
    .map((row) => new Timer(stripLww(row)))
    .sort(
      (a, b) =>
        a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds ||
        (a.idString < b.idString ? -1 : a.idString > b.idString ? 1 : 0),
    )

export class TimerRepo extends Context.Service<TimerRepo>()(
  "cheffect/Timers/Repo/TimerRepo",
  {
    make: Effect.gen(function* () {
      const timers = yield* makeSnapshot("timers")
      return {
        stream: timers.stream.pipe(Stream.map(decodeTimers)),
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
