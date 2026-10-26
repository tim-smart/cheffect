import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  type Browser,
  hasChromium,
  journalSettled,
  withSeededApp,
} from "./harness"

// A recipe is rated on its own page: one tap on a star saves it, with no
// form and nothing to submit, and a tap on the chosen star clears it. The
// arrow keys choose as they move and stop at the ends of the row, so a key
// pressed once too often cannot clear a rating, and what the keys choose is
// what the row shows even with a pointer parked over it. Each rating has to
// survive a reload, so it was written and not only shown.

const stars = `[...document.querySelectorAll('[role=radiogroup] button')]`
const star = (n: number) => `${stars}[${n - 1}]`
const filled = `${stars}.filter((b) => b.dataset.active === "true").length`
const checked = `${stars}.findIndex((b) => b.getAttribute("aria-checked") === "true") + 1`

const reloadAndExpect = async (
  browser: Browser,
  url: string,
  rating: number,
) => {
  await browser.navigate(url)
  await browser.waitFor(`${stars}.length === 5`)
  await browser.waitFor(`${filled} === ${rating}`, 5000)
  assert.equal(await browser.evaluate(checked), rating)
}

test(
  "a recipe is rated with one tap on its page, and cleared with another",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      const url = `${base}/recipes/${recipeId}`
      await reloadAndExpect(browser, url, 0)

      await browser.click(star(4))
      await browser.waitFor(`${filled} === 4`, 5000)
      await journalSettled(browser)
      await reloadAndExpect(browser, url, 4)

      // tapping the chosen star clears the rating
      await browser.click(star(4))
      await browser.waitFor(`${filled} === 0`, 5000)
      await journalSettled(browser)
      await reloadAndExpect(browser, url, 0)
    }),
)

test(
  "the arrow keys choose a rating and stop at the ends without clearing it",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      const url = `${base}/recipes/${recipeId}`
      // a mid-range phone: the keys below arrive faster than a write lands
      await browser.throttleCpu(4)
      await reloadAndExpect(browser, url, 0)

      // the first star is the tab stop on an unrated recipe; Right chooses
      // the next star, and a press past the last stays on it
      await browser.evaluate(`${star(1)}.focus()`)
      await browser.press("End", "End", 35)
      await browser.waitFor(`${filled} === 5`, 5000)
      await browser.press("ArrowRight", "ArrowRight", 39)
      await browser.press("ArrowRight", "ArrowRight", 39)
      assert.equal(await browser.evaluate(filled), 5)
      await journalSettled(browser)
      await reloadAndExpect(browser, url, 5)

      // the chosen star is the tab stop; Left walks down to the first and a
      // press before it stays there rather than clearing
      await browser.evaluate(`${star(5)}.focus()`)
      await browser.press("Home", "Home", 36)
      await browser.waitFor(`${filled} === 1`, 5000)
      await browser.press("ArrowLeft", "ArrowLeft", 37)
      await browser.press("ArrowUp", "ArrowUp", 38)
      assert.equal(await browser.evaluate(filled), 1)

      // a pointer parked over the fifth star previews five; a key press
      // shows what it chose instead, at the end of the row as well
      await browser.hover(star(5))
      await browser.waitFor(`${filled} === 5`, 5000)
      await browser.press("ArrowRight", "ArrowRight", 39)
      await browser.waitFor(`${filled} === 2`, 5000)
      await browser.hover(star(4))
      await browser.waitFor(`${filled} === 4`, 5000)
      await browser.press("ArrowLeft", "ArrowLeft", 37)
      await browser.waitFor(`${filled} === 1`, 5000)
      await browser.hover(star(3))
      await browser.waitFor(`${filled} === 3`, 5000)
      await browser.press("ArrowLeft", "ArrowLeft", 37)
      await browser.waitFor(`${filled} === 1`, 5000)
      await journalSettled(browser)
      await reloadAndExpect(browser, url, 1)
    }),
)
