import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

test(
  "a recipe selects its first step on load and still allows selecting another step",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.click(
        `document.querySelector('a[href="/recipes/${recipeId}"]')`,
      )
      await browser.waitFor(`!!document.querySelector(".bg-primary-muted")`)
      const selectedStep = () =>
        browser.evaluate<string>(
          `document.querySelector(".bg-primary-muted").firstElementChild.firstElementChild.textContent`,
        )
      assert.equal(await selectedStep(), "1")

      await browser.evaluate(
        `document.querySelector(".bg-primary-muted").nextElementSibling.scrollIntoView({ block: "center" })`,
      )
      await browser.click(
        `document.querySelector(".bg-primary-muted").nextElementSibling`,
      )
      assert.equal(await selectedStep(), "2")

      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`!!document.querySelector(".bg-primary-muted")`)
      assert.equal(await selectedStep(), "1")
    }),
)
