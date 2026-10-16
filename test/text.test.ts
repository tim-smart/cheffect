import { test } from "node:test"
import * as assert from "node:assert/strict"
import { compareText, includesFolded } from "@/lib/text"

// Recipe search is a substring test under Unicode case folding: accents are
// kept and the old SQL wildcards are literal. One shared collator sorts every
// name and title so that screens agree.

test("search folds case for all of Unicode, keeps accents and takes wildcards literally", () => {
  assert.ok(includesFolded("Crème brûlée", "crème"))
  assert.ok(!includesFolded("Crème brûlée", "creme"))
  assert.ok(includesFolded("ÆBLESKIVER", "æbleskiver"))
  assert.ok(includesFolded("Soup 100%", "100%"))
  assert.ok(!includesFolded("Soup 100%", "1_0"))
})

test("one collator sorts names case-insensitively with natural numbers", () => {
  const sorted = [
    "recipe 10",
    "Recipe 2",
    "recipe 1",
    "Éclair",
    "eclair",
    "apple",
  ].sort(compareText)
  assert.deepEqual(sorted, [
    "apple",
    "Éclair",
    "eclair",
    "recipe 1",
    "Recipe 2",
    "recipe 10",
  ])
  assert.equal(compareText("é", "E"), 0)
})
