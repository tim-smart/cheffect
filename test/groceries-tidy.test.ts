import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import { beautifyChanges } from "@/Groceries/beautify"
import { decodeAliases } from "@/Groceries/aliases"
import { guessAisle, planGroceryAdds, tidyList } from "@/Groceries/tidy"
import {
  type GroceryAisle,
  GroceryItem,
  GroceryItemId,
} from "@/domain/GroceryItem"
import { ingredientAliasKey } from "@/domain/IngredientAlias"
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
      ["change", "Salt", null, null],
      ["add", "Eggs", "1", null],
      ["add", "Onion", null, null],
      ["change", "Butter", null, null],
      ["add", "Flour", "1 cup", "Weekend"],
      ["add", "Flour", "3 1/2", "Weekend"],
      ["add", "Flour", null, null],
    ],
  )
  const [mergedSalt, , , mergedButter] = writes
  assert.ok(mergedSalt.op === "change" && mergedButter.op === "change")
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
    "Fish sauce",
    "Extra virgin olive oil",
    "Basmati rice",
    "Chicken stock",
    "Toothpaste",
    "Hand soap",
    "Dish soap",
    "Cat food",
    "Nappies",
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
    ["Smoked salmon", "Meat & Seafood"],
    ["Fish sauce", "Condiments & Sauces"],
    ["Extra virgin olive oil", "Oils & Vinegars"],
    ["Basmati rice", "Pasta, Rice & Grains"],
    ["Chicken stock", "Pantry"],
    ["Toothpaste", "Personal Care"],
    ["Hand soap", "Personal Care"],
    ["Dish soap", "Household"],
    ["Cat food", "Pet"],
    ["Nappies", "Baby"],
    ["Unobtainium", null],
  ])
})

test("the pass before the AI renames by alias and guesses aisles, and merges nothing", () => {
  const garlic = item("Garlic, minced", { aisle: "Pantry" })
  const { writes, items } = tidyList({
    items: [
      item("Salt", { recipeIds: [soup] }),
      // Merging would remove one, and a quantity set on it meanwhile.
      item("salt", { recipeIds: [cake] }),
      garlic,
      item("Pepper", { aisle: "Herbs & Spices" }),
    ],
    aisles: new Map(),
    aliases: decodeAliases([
      {
        id: ingredientAliasKey("ai", "garlic, minced"),
        name: "garlic, minced",
        source: "ai",
        canonical: "Garlic",
      },
    ]),
    now: DateTime.makeUnsafe(2000),
  })
  assert.deepEqual(
    writes.map((write) =>
      write.op === "remove"
        ? ["remove"]
        : [write.op, write.item.name, write.item.aisle, write.guessedAisle],
    ),
    [
      ["change", "Salt", "Herbs & Spices", true],
      ["change", "salt", "Herbs & Spices", true],
      ["change", "Garlic", "Pantry", false],
    ],
  )
  assert.deepEqual(
    items.map((item) => [item.name, item.recipeIds]),
    [
      ["Salt", [soup]],
      ["salt", [cake]],
      ["Garlic", null],
      ["Pepper", null],
    ],
  )
})

test("the AI's changes touch only the items they name, and its renames and merges are what it teaches", () => {
  const garlic = item("Garlic, minced", { quantity: "2" })
  const cloves = item("garlic cloves", { quantity: "1" })
  const crushed = item("Crushed garlic", { quantity: "1" })
  const parsley = item("Chopped parsley")
  const eggs = item("eggs")
  const salt = item("Salt", { aisle: "Pantry" })
  const { updated, removed, lessons } = beautifyChanges(
    [garlic, cloves, crushed, parsley, eggs, salt],
    {
      merges: [
        {
          targetId: cloves.idString.toUpperCase(),
          sourceIds: [crushed.idString],
          name: "Garlic cloves",
          quantity: "2",
        },
        // A later merge can take an earlier target.
        {
          targetId: garlic.idString,
          sourceIds: [cloves.idString],
          name: "Garlic",
          quantity: "4",
        },
      ],
      updates: [
        { id: parsley.idString, name: "Parsley", quantity: null },
        { id: eggs.idString, name: "Eggs", quantity: null },
        // Already merged away: dropped.
        { id: crushed.idString, name: "Garlic", quantity: "1" },
      ],
      aisles: [
        { id: parsley.idString, aisle: "Produce" },
        // Already has one.
        { id: salt.idString, aisle: "Herbs & Spices" },
      ],
    },
    DateTime.makeUnsafe(2000),
  )
  assert.deepEqual(
    updated.map(({ previous, item }) => [
      previous.name,
      item.name,
      item.quantity,
      item.aisle,
    ]),
    [
      ["Garlic, minced", "Garlic", "4", null],
      ["Chopped parsley", "Parsley", null, "Produce"],
      ["eggs", "Eggs", null, null],
    ],
  )
  assert.deepEqual(
    removed.map((item) => item.name),
    ["Crushed garlic", "garlic cloves"],
  )
  assert.deepEqual(lessons, [
    { name: "Garlic, minced", canonical: "Garlic" },
    { name: "Chopped parsley", canonical: "Parsley" },
    { name: "Crushed garlic", canonical: "Garlic" },
    { name: "garlic cloves", canonical: "Garlic" },
  ])
})
