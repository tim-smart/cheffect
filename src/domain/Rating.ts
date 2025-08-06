import * as Schema from "effect/Schema"

export const Rating = Schema.Number.pipe(
  Schema.between(1, 5, { message: () => "Rating must be between 1 and 5" }),
  Schema.brand("Rating"),
)
