import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// The recipe form's photo field takes whatever the recipe schema takes: a
// path like "/placeholder.svg" is a photo link too. The browser's own URL
// check must not stand between such a value and the save.

const setValue = (selector: string, value: string) => `(() => {
  const input = document.querySelector(${JSON.stringify(selector)})
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event("input", { bubbles: true }))
})()`

test(
  "a photo given as a path saves",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId: id }) => {
      await browser.navigate(`${base}/edit/${id}`)
      await browser.waitFor(
        `!!document.querySelector('input[name="imageUrl"]')`,
      )
      await browser.evaluate(
        setValue('input[name="imageUrl"]', "/placeholder.svg"),
      )
      await browser.evaluate(
        `document.querySelector('form button[type="submit"]').click()`,
      )
      await browser.waitFor(`!location.pathname.startsWith("/edit/")`, 15_000)
      await journalSettled(browser)

      await browser.navigate(`${base}/recipes/${id}`)
      await browser.waitFor(`!!document.querySelector("main header img")`)
      assert.equal(
        await browser.evaluate<string | null>(
          `document.querySelector("main header img").getAttribute("src")`,
        ),
        "/placeholder.svg",
      )
    }),
)

// The time fields show "min" after the number; assistive technology hears
// the unit in full.
test(
  "the time fields describe their unit in full",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId: id }) => {
      await browser.navigate(`${base}/edit/${id}`)
      await browser.waitFor(
        `!!document.querySelector('input[name="prepTime"]')`,
      )
      // the description's text, with "min" shown and "minutes" spoken
      const described = await browser.evaluate<Array<boolean>>(
        `["prepTime", "cookingTime"].map((name) => {
          const input = document.querySelector('input[name="' + name + '"]')
          const id = input.getAttribute("aria-describedby")
          const text = id ? document.getElementById(id)?.textContent ?? "" : ""
          return text.includes("minutes")
        })`,
      )
      assert.deepEqual(described, [true, true])
    }),
)
