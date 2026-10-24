import { normalizeIngredientName } from "@/domain/GroceryItem"
import type { IngredientAliasRow } from "./Table"

// Reads of the ingredient aliases, as pure functions over the table rows.
// Nothing writes aliases yet; every client reads them a release before any
// client writes them.

// Where each normalised name points: a user's row over the AI's for the same
// name. `null` is a user's pin, which nothing redirects.
export type IngredientAliases = ReadonlyMap<string, string | null>

export const decodeAliases = (
  rows: ReadonlyArray<IngredientAliasRow>,
): IngredientAliases => {
  const aliases = new Map<string, string | null>()
  for (const row of rows) {
    if (row.source === "ai" && row.canonical !== null) {
      aliases.set(row.name, row.canonical)
    }
  }
  for (const row of rows) {
    if (row.source === "user") aliases.set(row.name, row.canonical)
  }
  return aliases
}

const maxHops = 8

// The name `name` is written as on a list: its aliases followed until a name
// with none, or a pin. Rows from different devices can chain or loop in any
// order, so the answer depends only on the rows, never on the order they were
// written in: a loop resolves to its member with the smallest normalised
// name, and a chain longer than `maxHops` leaves the name as it is.
export const canonicalName = (
  aliases: IngredientAliases,
  name: string,
): string => {
  const names = [name]
  const keys = [normalizeIngredientName(name)]
  for (;;) {
    const next = aliases.get(keys[keys.length - 1])
    if (next === undefined || next === null) return names[names.length - 1]
    if (keys.length > maxHops) return name
    const key = normalizeIngredientName(next)
    const seen = keys.indexOf(key)
    if (seen !== -1) {
      let smallest = seen
      for (let i = seen + 1; i < keys.length; i++) {
        if (keys[i] < keys[smallest]) smallest = i
      }
      return names[smallest]
    }
    names.push(next)
    keys.push(key)
  }
}

// The normalised canonical name, for matching names against each other.
export const canonicalKey = (aliases: IngredientAliases, name: string) =>
  normalizeIngredientName(canonicalName(aliases, name))
