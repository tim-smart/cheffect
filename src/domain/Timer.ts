import { Model } from "@effect/sql"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
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
  static array = Schema.Array(Timer)

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
}
