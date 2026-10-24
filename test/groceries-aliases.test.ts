import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import {
  canonicalName,
  decodeAliases,
  type IngredientAliases,
} from "@/Groceries/aliases"
import { autocomplete, inPantry } from "@/Groceries/Repo"
import type { IngredientAliasRow } from "@/Groceries/Table"
import { planGroceryAdds } from "@/Groceries/tidy"
import {
  GroceryItem,
  GroceryItemId,
  PANTRY_GROCERY_LIST_NAME,
} from "@/domain/GroceryItem"
import {
  ingredientAliasKey,
  type IngredientAliasSource,
} from "@/domain/IngredientAlias"
import { generateUuidBytes } from "@/lib/Id"

const alias = (
  source: IngredientAliasSource,
  name: string,
  canonical: string | null,
): IngredientAliasRow => ({
  id: ingredientAliasKey(source, name),
  name,
  source,
  canonical,
})

const resolveAll = (
  rows: ReadonlyArray<IngredientAliasRow>,
  names: ReadonlyArray<string>,
) => {
  // Rows come back from storage in key order, never write order, so the
  // answer can't depend on the order; check both.
  const forward = decodeAliases(rows)
  const backward = decodeAliases([...rows].reverse())
  return names.map((name) => {
    const resolved = canonicalName(forward, name)
    assert.equal(canonicalName(backward, name), resolved, name)
    return resolved
  })
}

test("a name resolves through its aliases, a user's over the AI's, to the same answer on every device", () => {
  const chain = Array.from({ length: 10 }, (_, i) =>
    alias("ai", `step ${i}`, `step ${i + 1}`),
  )
  const resolved = resolveAll(
    [
      // A chain written in either order.
      alias("ai", "garlic, minced", "Garlic clove"),
      alias("ai", "garlic clove", "Garlic"),
      // Loops resolve to their smallest member.
      alias("ai", "b", "A"),
      alias("ai", "a", "B"),
      alias("ai", "z", "y"),
      alias("ai", "y", "x"),
      alias("ai", "x", "z"),
      // A user's alias hides the AI's for the same name, and a pin stops
      // the chain there.
      alias("ai", "cilantro", "Parsley"),
      alias("user", "cilantro", "Coriander"),
      alias("ai", "spring onion", "Onion"),
      alias("user", "spring onion", null),
      ...chain,
    ],
    [
      "Garlic, minced",
      "Garlic clove",
      "B",
      "z",
      "Cilantro",
      "Spring onion",
      "step 5",
      "step 0",
      "Milk",
    ],
  )
  assert.deepEqual(resolved, [
    "Garlic",
    "Garlic",
    "A",
    "x",
    "Coriander",
    "Spring onion",
    "step 10",
    // Past the hop budget the name stays as it is.
    "step 0",
    "Milk",
  ])
})

const item = (name: string, list: string | null = null) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list,
    name,
    quantity: null,
    aisle: null,
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
  })

test("adds, the pantry and autocomplete read names through their aliases", () => {
  const aliases: IngredientAliases = decodeAliases([
    alias("ai", "garlic, minced", "Garlic"),
    alias("ai", "fresh parsley", "Parsley"),
  ])
  const onList = item("Fresh parsley")
  const writes = planGroceryAdds({
    existing: [onList],
    aisles: new Map(),
    aliases,
    incoming: [item("Garlic, minced"), item("Parsley")],
    now: DateTime.makeUnsafe(2000),
  })
  assert.deepEqual(
    writes.map((write) =>
      write.op === "remove"
        ? write
        : [write.op, write.item.idString === onList.idString, write.item.name],
    ),
    [
      ["add", false, "Garlic"],
      ["merge", true, "Fresh parsley"],
    ],
  )

  const pantry = inPantry([item("Garlic", PANTRY_GROCERY_LIST_NAME)], aliases)
  assert.equal(pantry("garlic, minced"), true)
  assert.equal(pantry("Parsley"), false)

  assert.deepEqual(
    autocomplete(
      new Map([
        ["garlic", "Produce"],
        ["garlic, minced", "Produce"],
      ]),
      aliases,
      "garl",
    ),
    ["garlic"],
  )
})
