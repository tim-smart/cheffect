import * as Schema from "effect/Schema"

// Where an aisle sits on a grocery list. `list` is null for the default list.
export const GroceryAisleOrder = Schema.Struct({
  list: Schema.NullOr(Schema.String),
  aisle: Schema.String,
  sortOrder: Schema.Finite,
  updatedAt: Schema.DateTimeUtcFromMillis,
})
export type GroceryAisleOrder = typeof GroceryAisleOrder.Type

// The row key is the pair, so two devices reordering the same aisle on the
// same list write the same row.
export const groceryAisleOrderKey = (
  list: string | null,
  aisle: string,
): string => JSON.stringify([list, aisle])
