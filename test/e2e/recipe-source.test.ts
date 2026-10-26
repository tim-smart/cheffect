import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

// A recipe's source is shown on its page even when it has no link. The
// seeded recipes name a source but have no URL.

const source = `(() => {
  const el = [...document.querySelectorAll("main span")].find(
    (s) => s.textContent === "Cheffect Test Kitchen",
  )
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    visible: rect.width > 0 && rect.height > 0,
    linked: !!el.closest("a"),
  }
})()`

test(
  "a recipe source without a link is shown as plain text",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`!!document.querySelector("main h1")`)
      assert.deepEqual(await browser.evaluate(source), {
        visible: true,
        linked: false,
      })
    }),
)
