import * as Schema from "effect/Schema"

export const Rating = Schema.Number.pipe(
  Schema.check(
    Schema.isBetween(
      { minimum: 1, maximum: 5 },
      { message: "Rating must be between 1 and 5" },
    ),
  ),
  Schema.brand("Rating"),
)
