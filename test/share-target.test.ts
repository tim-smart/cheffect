import { test } from "node:test"
import * as assert from "node:assert/strict"
import { sharedUrl } from "@/lib/shareTarget"

// A share target query names the page to import in `url`, or in `text` or
// `title` when the sharing app puts the link there.

const shared = (query: Record<string, string>) =>
  sharedUrl(new URLSearchParams(query))

test("a field holding just a URL is taken whole, apostrophes included", () => {
  assert.equal(
    shared({ url: "https://recipe.example/grandma's-soup?serves=4" }),
    "https://recipe.example/grandma's-soup?serves=4",
  )
  assert.equal(
    shared({ text: "  https://recipe.example/stew  " }),
    "https://recipe.example/stew",
  )
})

test("a link inside a message is found without the punctuation around it", () => {
  assert.equal(
    shared({ text: "Grandma's soup https://recipe.example/grandma's-soup" }),
    "https://recipe.example/grandma's-soup",
  )
  assert.equal(
    shared({ text: "Try this (https://recipe.example/stew)." }),
    "https://recipe.example/stew",
  )
  assert.equal(
    shared({ text: `Try "https://recipe.example/stew"` }),
    "https://recipe.example/stew",
  )
})

test("an empty or non-HTTP field falls back to the next one", () => {
  assert.equal(
    shared({ url: "", text: "Stew https://recipe.example/stew" }),
    "https://recipe.example/stew",
  )
  assert.equal(
    shared({ url: "mailto:chef@example.com", title: "https://a.example/b" }),
    "https://a.example/b",
  )
  assert.equal(shared({ text: "no link here" }), undefined)
  assert.equal(shared({}), undefined)
})
