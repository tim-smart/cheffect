import * as Model from "effect/schema/Model"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import * as Schema from "effect/Schema"
import { UuidBytes, UuidFromString, uuidString } from "@/lib/Id"

export const TimerId = UuidBytes("TimerId")
export type TimerId = typeof TimerId.Type
export const TimerIdFromString = UuidFromString(TimerId)

export class Timer extends Model.Class<Timer>("Timer")({
  // UUID bytes in storage and events, the canonical string in JSON.
  id: Model.Field({
    select: TimerId,
    insert: TimerId,
    update: TimerId,
    json: TimerIdFromString,
  }),
  label: Schema.String,
  duration: Schema.DurationFromMillis,
  expiresAt: Schema.DateTimeUtcFromMillis,
  pausedRemaining: Schema.NullOr(Schema.DurationFromMillis),
  createdAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["update", "jsonCreate", "jsonUpdate"]),
  ),
  updatedAt: Schema.DateTimeUtcFromMillis.pipe(
    Model.FieldExcept(["jsonCreate", "jsonUpdate"]),
  ),
}) {
  static array = Schema.Array(Timer)

  get idString(): string {
    return uuidString(this.id)
  }

  [Equal.symbol](that: Timer) {
    return this.idString === that.idString
  }

  [Hash.symbol]() {
    return Hash.string(this.idString)
  }

  notificationTag(): string {
    return `timer-${this.idString}`
  }

  remainingAt(now: DateTime.Utc): Duration.Duration {
    if (this.pausedRemaining !== null) {
      return this.pausedRemaining
    } else if (DateTime.isGreaterThanOrEqualTo(now, this.expiresAt)) {
      return Duration.zero
    }
    return Duration.abs(DateTime.distance(now, this.expiresAt))
  }

  pause(): Timer {
    if (this.pausedRemaining !== null) return this
    const now = DateTime.nowUnsafe()
    return new Timer({
      ...this,
      pausedRemaining: this.remainingAt(now),
      updatedAt: now,
    })
  }

  resume(): Timer {
    if (this.pausedRemaining === null) return this
    const now = DateTime.nowUnsafe()
    return new Timer({
      ...this,
      expiresAt: DateTime.addDuration(now, this.pausedRemaining),
      pausedRemaining: null,
      updatedAt: now,
    })
  }

  add(now: DateTime.Utc, duration: Duration.Duration): Timer {
    const remaining = this.remainingAt(now)
    if (Duration.isZero(duration)) {
      return new Timer({
        ...this,
        duration,
        expiresAt: DateTime.addDuration(now, duration),
        updatedAt: DateTime.nowUnsafe(),
      })
    } else if (this.pausedRemaining) {
      return new Timer({
        ...this,
        duration: Duration.sum(this.duration, duration),
        pausedRemaining: Duration.sum(this.pausedRemaining, duration),
        updatedAt: DateTime.nowUnsafe(),
      })
    }
    return new Timer({
      ...this,
      duration: Duration.sum(this.duration, duration),
      expiresAt: DateTime.addDuration(now, Duration.sum(remaining, duration)),
      updatedAt: DateTime.nowUnsafe(),
    })
  }
}

// How long until the soonest running timer finishes, if any is still running.
export const untilNextExpiry = (
  timers: Iterable<Timer>,
  now: DateTime.Utc,
): Duration.Duration | undefined => {
  let next: Duration.Duration | undefined
  for (const timer of timers) {
    if (timer.pausedRemaining !== null) continue
    const remaining = timer.remainingAt(now)
    if (Duration.isZero(remaining)) continue
    if (next === undefined || Duration.isLessThan(remaining, next)) {
      next = remaining
    }
  }
  return next
}
