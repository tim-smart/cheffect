import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// A recipe is rated on its own page: one tap on a star saves it, with no
// form and nothing to submit, and a tap on the chosen star clears it. The
// rating has to survive a reload, so it was written and not only shown.

const stars = `[...document.querySelectorAll('[role=radiogroup] button')]`
const star = (n: number) => `${stars}[${n - 1}]`
const filled = `${stars}.filter((b) => b.dataset.active === "true").length`

test(
  "a recipe is rated with one tap on its page, and cleared with another",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`${stars}.length === 5`)
      assert.equal(await browser.evaluate(filled), 0)

      await browser.click(star(4))
      await browser.waitFor(`${filled} === 4`, 5000)
      await journalSettled(browser)

      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`${filled} === 4`)
      assert.equal(
        await browser.evaluate(`${star(4)}.getAttribute("aria-checked")`),
        "true",
      )

      // tapping the chosen star clears the rating
      await browser.click(star(4))
      await browser.waitFor(`${filled} === 0`, 5000)
      await journalSettled(browser)

      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`${stars}.length === 5`)
      assert.equal(await browser.evaluate(filled), 0)
    }),
)
