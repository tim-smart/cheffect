import * as Schema from "effect/Schema"
import { normalizeIngredientName } from "./GroceryItem"

// Who taught an alias. A user's alias for a name and the AI's are separate
// rows, so an AI write can never replace a user's, on any device.
export const IngredientAliasSource = Schema.Literals(["user", "ai"])
export type IngredientAliasSource = typeof IngredientAliasSource.Type

// The name an ingredient is written as on a grocery list, by the name it was
// added under. `canonical` is null for a user's pin: the name is final and
// nothing redirects it. AI rows always name a canonical.
export const IngredientAlias = Schema.Struct({
  name: Schema.String,
  source: IngredientAliasSource,
  canonical: Schema.NullOr(Schema.String),
})
export type IngredientAlias = typeof IngredientAlias.Type

// The row key: the source and the normalised name.
export const ingredientAliasKey = (
  source: IngredientAliasSource,
  name: string,
): string => JSON.stringify([source, normalizeIngredientName(name)])
