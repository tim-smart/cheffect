import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  type Browser,
  hasChromium,
  journalSettled,
  withSeededApp,
} from "./harness"

const input = `document.querySelector('input[placeholder="Add an item..."]')`
const checkboxes = `document.querySelectorAll('main [role="checkbox"]')`
const suggestion = `[...document.querySelectorAll('[cmdk-item]')].find((item) => item.textContent === "maple syrup")`
const typeName = (browser: Browser, value: string) =>
  browser.evaluate(`(() => {
    const input = ${input}
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })()`)

for (const action of ["tap", "click"] as const) {
  test(
    `a grocery suggestion ${action} adds only that item without checking the row underneath`,
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
        await browser[action](input)
        await typeName(browser, "le")
        // The second result overlaps the grocery rows, not just the aisle heading.
        await browser.waitFor(`!!${suggestion}`)
        await browser[action](suggestion)
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
        assert.equal(
          await browser.evaluate(
            `[...${checkboxes}].filter((checkbox) => checkbox.parentElement.textContent.includes("maple syrup")).length`,
          ),
          1,
        )
        assert.equal(
          await browser.evaluate(`document.activeElement === ${input}`),
          true,
        )

        // Removing a learned suggestion must not add, delete or complete groceries.
        await typeName(browser, "le")
        const remove = `document.querySelector('button[aria-label="Remove maple syrup from suggestions"]')`
        await browser.waitFor(`!!${remove}`)
        await browser[action](remove)
        await browser.waitFor(`!${remove}`)
        assert.equal(await browser.evaluate(`${checkboxes}.length`), 10)
        assert.equal(await browser.evaluate(`${input}.value`), "le")
        assert.equal(
          await browser.evaluate(
            `document.querySelectorAll('main [role="checkbox"][aria-checked="true"]').length`,
          ),
          0,
        )

        // A deliberate tap/click on a grocery still checks it off.
        await browser.evaluate(`${input}.blur()`)
        await browser[action](
          `${checkboxes}[0].parentElement.querySelector("span")`,
        )
        await browser.waitFor(
          `document.querySelectorAll('main [role="checkbox"][aria-checked="true"]').length === 1`,
        )
      }),
  )
}

test(
  "Enter adds a typed grocery or the keyboard-selected suggestion exactly once",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/groceries`)
      await browser.waitFor(`${checkboxes}.length === 10`)
      await browser.click(input)
      await typeName(browser, "Oats")
      await browser.press("Enter", "Enter", 13)
      await browser.waitFor(
        `${input}.value === "" && ${checkboxes}.length === 11`,
      )
      assert.equal(
        await browser.evaluate(
          `[...${checkboxes}].filter((checkbox) => checkbox.parentElement.textContent === "Oats").length`,
        ),
        1,
      )

      // With suggestions shown, Enter still adds the raw text until one is selected.
      await typeName(browser, "le")
      await browser.waitFor(`!!${suggestion}`)
      await browser.press("Enter", "Enter", 13)
      await browser.waitFor(
        `${input}.value === "" && ${checkboxes}.length === 12`,
      )
      assert.equal(
        await browser.evaluate(
          `[...${checkboxes}].filter((checkbox) => checkbox.parentElement.textContent === "le").length`,
        ),
        1,
      )

      // Remove the existing maple syrup so selecting it adds a single new row.
      await browser.click(
        `[...${checkboxes}].find((checkbox) => checkbox.parentElement.textContent.includes("Maple syrup")).parentElement.querySelector('button:last-child')`,
      )
      await browser.waitFor(`${checkboxes}.length === 11`)
      await browser.click(input)
      await typeName(browser, "map")
      await browser.waitFor(`!!${suggestion}`)
      await browser.press("ArrowDown", "ArrowDown", 40)
      await browser.waitFor(
        `${suggestion}.getAttribute("data-selected") === "true"`,
      )
      await browser.press("Enter", "Enter", 13)
      await browser.waitFor(
        `${input}.value === "" && ${checkboxes}.length === 12`,
      )
      await journalSettled(browser)
      assert.equal(
        await browser.evaluate(
          `[...${checkboxes}].filter((checkbox) => checkbox.parentElement.textContent === "maple syrup").length`,
        ),
        1,
      )
    }),
)
