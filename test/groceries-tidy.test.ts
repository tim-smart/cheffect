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

test("an added item merges into its name's line only where no concurrent write could lose a quantity", () => {
  const salt = item("Salt", { recipeIds: [soup] })
  const butter = item("Butter")
  const writes = planGroceryAdds({
    existing: [
      salt,
      // A sum written into an existing line could replace one written
      // meanwhile on another device.
      item("Eggs", { quantity: "2" }),
      item("Onion", { completed: true }),
      // A line the incoming item can't merge into doesn't hide one it can.
      item("Butter", { quantity: "1 cup" }),
      butter,
    ],
    aisles: new Map(),
    aliases: new Map(),
    incoming: [
      item("salt ", { recipeIds: [cake] }),
      item("Eggs", { quantity: "1" }),
      item("Onion"),
      item("Butter"),
      // Lines this batch adds are its own, so their counts add up.
      item("Flour", { list: "Weekend", quantity: "1 cup" }),
      item("Flour", { list: "Weekend", quantity: "2" }),
      item("flour", { list: "Weekend", quantity: "1 1/2" }),
      item("Flour"),
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
      ["merge", "Salt", null, null],
      ["add", "Eggs", "1", null],
      ["add", "Onion", null, null],
      ["merge", "Butter", null, null],
      ["add", "Flour", "1 cup", "Weekend"],
      ["add", "Flour", "3 1/2", "Weekend"],
      ["add", "Flour", null, null],
    ],
  )
  const [mergedSalt, , , mergedButter] = writes
  assert.ok(mergedSalt.op === "merge" && mergedButter.op === "merge")
  assert.equal(mergedSalt.item.idString, salt.idString)
  assert.deepEqual(mergedSalt.item.recipeIds, [soup, cake])
  assert.equal(mergedButter.item.idString, butter.idString)
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
