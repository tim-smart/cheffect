import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

const steps = `[...document.querySelectorAll("h2")].find((h) => h.textContent === "Method")?.nextElementSibling.children`
const selectedStep = `[...(${steps})].findIndex((step) => step.classList.contains("bg-primary-muted"))`

test(
  "opening a recipe selects its first step, including after leaving a later step selected",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, recipeId }) => {
      await browser.click(
        `document.querySelector('a[href="/recipes/${recipeId}"]')`,
      )
      await browser.waitFor(`(${steps})?.length > 1`)
      assert.equal(await browser.evaluate(selectedStep), 0)

      await browser.evaluate(`(${steps})[1].scrollIntoView()`)
      await browser.click(`(${steps})[1]`)
      await browser.waitFor(`${selectedStep} === 1`)

      // Stay in the same app session so the recipe's cached selection survives.
      await browser.evaluate(`history.back()`)
      await browser.waitFor(
        `!!document.querySelector('a[href="/recipes/${recipeId}"]')`,
      )
      await browser.evaluate(
        `document.querySelector('a[href="/recipes/${recipeId}"]').scrollIntoView()`,
      )
      await browser.click(
        `document.querySelector('a[href="/recipes/${recipeId}"]')`,
      )
      await browser.waitFor(`(${steps})?.length > 1`)
      assert.equal(await browser.evaluate(selectedStep), 0)
    }),
)
