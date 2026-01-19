import { Model } from "@effect/sql"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import * as Schema from "effect/Schema"

export class Timer extends Model.Class<Timer>("Timer")({
  id: Model.GeneratedByApp(Schema.String),
  label: Schema.String,
  duration: Schema.DurationFromMillis,
  expiresAt: Schema.DateTimeUtcFromNumber,
  pausedRemaining: Schema.NullOr(Schema.DurationFromMillis),
  createdAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldExcept("update", "jsonCreate", "jsonUpdate"),
  ),
  updatedAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldExcept("jsonCreate", "jsonUpdate"),
  ),
}) {
  static array = Schema.Array(Timer);

  [Equal.symbol](that: Timer) {
    return this.id === that.id
  }

  [Hash.symbol]() {
    return Hash.string(this.id)
  }

  notificationTag(): string {
    return `timer-${this.id}`
  }

  remainingAt(now: DateTime.Utc): Duration.Duration {
    if (this.pausedRemaining !== null) {
      return this.pausedRemaining
    } else if (DateTime.greaterThanOrEqualTo(now, this.expiresAt)) {
      return Duration.zero
    }
    return DateTime.distanceDuration(now, this.expiresAt)
  }

  pause(): Timer {
    if (this.pausedRemaining !== null) return this
    const now = DateTime.unsafeNow()
    return new Timer({
      ...this,
      pausedRemaining: this.remainingAt(now),
      updatedAt: now,
    })
  }

  resume(): Timer {
    if (this.pausedRemaining === null) return this
    const now = DateTime.unsafeNow()
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
        updatedAt: DateTime.unsafeNow(),
      })
    } else if (this.pausedRemaining) {
      return new Timer({
        ...this,
        duration: Duration.sum(this.duration, duration),
        pausedRemaining: Duration.sum(this.pausedRemaining, duration),
        updatedAt: DateTime.unsafeNow(),
      })
    }
    return new Timer({
      ...this,
      duration: Duration.sum(this.duration, duration),
      expiresAt: DateTime.addDuration(now, Duration.sum(remaining, duration)),
      updatedAt: DateTime.unsafeNow(),
    })
  }
}
