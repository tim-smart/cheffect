import { Duration } from "effect"
import * as Schema from "effect/Schema"

export const DurationFromMinutes = Schema.transform(
  Schema.Number,
  Schema.DurationFromSelf,
  {
    decode: Duration.minutes,
    encode: Duration.toMinutes,
  },
)
