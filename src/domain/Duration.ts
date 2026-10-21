import { Duration } from "effect"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

export const DurationFromMinutes = Schema.Finite.pipe(
  Schema.decodeTo(
    Schema.Duration,
    SchemaTransformation.transform({
      decode: Duration.minutes,
      encode: Duration.toMinutes,
    }),
  ),
)
