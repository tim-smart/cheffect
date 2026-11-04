import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

const input = `document.querySelector('input[placeholder="Add an item..."]')`
const checkboxes = `document.querySelectorAll('main [role="checkbox"]')`
const suggestion = `[...document.querySelectorAll('[cmdk-item]')].find((item) => item.textContent === "maple syrup")`

test(
  "tapping a grocery suggestion does not check the grocery underneath",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.setViewport(390, 844)
      await browser.navigate(`${base}/groceries`)
      await browser.waitFor(`${checkboxes}.length === 10`)

      // Removing the seeded item keeps its learned name available to add again.
      await browser.click(
        `[...${checkboxes}].find((checkbox) => checkbox.parentElement.textContent.includes("Maple syrup")).parentElement.querySelector('button:last-child')`,
      )
      await browser.waitFor(`${checkboxes}.length === 9`)
      await browser.tap(input)
      await browser.evaluate(`(() => {
        const input = ${input}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "le")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      // The second result overlaps the grocery rows, not just the aisle heading.
      await browser.waitFor(`!!${suggestion}`)
      await browser.tap(suggestion)
      await browser.waitFor(
        `${input}.value === "" && ${checkboxes}.length === 10`,
      )
      await journalSettled(browser)
      assert.equal(
        await browser.evaluate(
          `document.querySelectorAll('main [role="checkbox"][aria-checked="true"]').length`,
        ),
        0,
        "the autocomplete tap must not tick off an existing grocery",
      )
    }),
)
