import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import { beautifyChanges } from "@/Groceries/beautify"
import { guessAisle, planGroceryAdds } from "@/Groceries/tidy"
import {
  type GroceryAisle,
  GroceryItem,
  GroceryItemId,
} from "@/domain/GroceryItem"
import { RecipeId } from "@/domain/Recipe"
import { generateUuidBytes } from "@/lib/Id"

const soup = RecipeId.make(generateUuidBytes())
const cake = RecipeId.make(generateUuidBytes())

const item = (
  name: string,
  fields: Partial<
    Pick<GroceryItem, "list" | "quantity" | "aisle" | "recipeIds" | "completed">
  > = {},
) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list: null,
    name,
    quantity: null,
    aisle: null,
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
    ...fields,
  })

test("an added item merges into the same name on its list when the counts add up, and is added otherwise", () => {
  const eggs = item("Eggs", { quantity: "2", recipeIds: [soup] })
  const writes = planGroceryAdds({
    existing: [
      eggs,
      item("Milk", { quantity: "1 cup" }),
      item("Onion", { completed: true }),
      item("Carrots", { list: "Weekend" }),
    ],
    aisles: new Map(),
    incoming: [
      item("eggs ", { quantity: "1 1/2", recipeIds: [cake] }),
      item("Milk", { quantity: "250ml" }),
      item("Onion"),
      item("Carrots"),
      item("carrots"),
    ],
    now: DateTime.makeUnsafe(2000),
  })
  assert.deepEqual(
    writes.map((write) =>
      write.op === "remove"
        ? write
        : [write.op, write.item.name, write.item.quantity, write.item.list],
    ),
    [
      ["merge", "Eggs", "3 1/2", null],
      ["add", "Milk", "250ml", null],
      ["add", "Onion", null, null],
      ["add", "Carrots", null, null],
    ],
  )
  const merged = writes[0]
  assert.ok(merged.op === "merge")
  assert.equal(merged.item.idString, eggs.idString)
  assert.deepEqual(merged.item.recipeIds, [soup, cake])
})

test("an item without an aisle takes the one learned for it, then for the part before a comma, then the dictionary's", () => {
  const aisles = new Map<string, GroceryAisle>([["parsley", "Herbs & Spices"]])
  const guesses = [
    "Parsley",
    "parsley, chopped",
    "Chopped fresh basil",
    "Garlic cloves",
    "Coconut milk",
    "Chicken thighs",
    "Frozen peas",
    "Smoked salmon",
    "Unobtainium",
  ].map((name) => [name, guessAisle(aisles, name)])
  assert.deepEqual(guesses, [
    ["Parsley", "Herbs & Spices"],
    ["parsley, chopped", "Herbs & Spices"],
    ["Chopped fresh basil", "Produce"],
    ["Garlic cloves", "Produce"],
    ["Coconut milk", "Canned & Jar Goods"],
    ["Chicken thighs", "Meat & Seafood"],
    ["Frozen peas", "Frozen Foods"],
    ["Smoked salmon", "Seafood"],
    ["Unobtainium", null],
  ])
})

test("an item the beautify response leaves out stays on the list, and only merged items are removed", () => {
  const garlic = item("Garlic, minced", { quantity: "2" })
  const garlicCloves = item("garlic cloves", { quantity: "1" })
  const salt = item("Salt")
  const { updated, removed } = beautifyChanges(
    [garlic, garlicCloves, salt],
    {
      items: [
        {
          id: garlic.id,
          name: "Garlic",
          quantity: "3",
          aisle: "Produce",
          mergedIds: [garlicCloves.idString.toUpperCase()],
        },
      ],
    },
    DateTime.makeUnsafe(2000),
  )
  assert.deepEqual(
    updated.map((item) => [item.idString, item.name, item.quantity]),
    [[garlic.idString, "Garlic", "3"]],
  )
  assert.deepEqual(
    removed.map((item) => item.idString),
    [garlicCloves.idString],
  )
})
