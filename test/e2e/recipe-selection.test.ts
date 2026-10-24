import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

test(
  "a recipe starts at its first step and recovers when the selected step is removed",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.click(
        `document.querySelector('a[href="/recipes/${recipeId}"]')`,
      )
      await browser.waitFor(`!!document.querySelector(".bg-primary-muted")`)
      const selectedStep = () =>
        browser.evaluate<string | undefined>(
          `document.querySelector(".bg-primary-muted")?.firstElementChild.firstElementChild.textContent`,
        )
      assert.equal(await selectedStep(), "1")

      await browser.evaluate(
        `document.querySelector(".bg-primary-muted").nextElementSibling.scrollIntoView({ block: "center" })`,
      )
      await browser.click(
        `document.querySelector(".bg-primary-muted").nextElementSibling`,
      )
      assert.equal(await selectedStep(), "2")

      await browser.evaluate(`scrollTo(0, 0)`)
      await browser.click(
        `document.querySelector('button[aria-label="Recipe options"]')`,
      )
      await browser.click(
        `document.querySelector('a[href="/edit/${recipeId}"]')`,
      )
      await browser.waitFor(
        `!!document.querySelector('textarea[name="steps.1.text"]')`,
      )
      // Keep only the first step. The selected index must not survive past the
      // end of the edited recipe when returning to its details.
      while (
        await browser.evaluate<boolean>(
          `document.querySelectorAll('textarea[name^="steps."]').length > 1`,
        )
      ) {
        const removeLastStep = `[...document.querySelectorAll('textarea[name^="steps."]')].at(-1).closest(".border.p-4").querySelector("button:has(.lucide-trash)")`
        await browser.evaluate(
          `${removeLastStep}.scrollIntoView({ block: "center" })`,
        )
        await browser.click(removeLastStep)
      }
      await browser.evaluate(`scrollTo(0, 0)`)
      await browser.click(
        `document.querySelector('button[type="submit"][form]')`,
      )
      await browser.waitFor(
        `!!document.querySelector('button[aria-label="Recipe options"]')`,
      )
      assert.equal(await selectedStep(), "1")

      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`!!document.querySelector(".bg-primary-muted")`)
      assert.equal(await selectedStep(), "1")
    }),
)
