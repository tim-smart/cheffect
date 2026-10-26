import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, withSeededApp } from "./harness"

// Ctrl+K (⌘K on Apple keyboards) opens a recipe search over any screen.
// Escape closes it and leaves the page as it was, its state and focus
// included; only picking a result navigates.

const dialog = `document.querySelector('[role="dialog"]')`
const dialogInput = `${dialog}?.querySelector("input")`
const pageSearch = `document.querySelector('main input[placeholder="Search recipes..."]')`
const ctrl = 2

const type = (browser: Browser, input: string, value: string) =>
  browser.evaluate(`(() => {
    const input = ${input}
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })()`)

test(
  "Ctrl+K searches recipes in a dialog: Escape keeps the page, Enter opens the recipe",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, recipeId }) => {
      await browser.setViewport(1280, 900, { mobile: false })
      const title = await browser.evaluate<string>(
        `document.querySelector('a[href="/recipes/${recipeId}"] h3').textContent`,
      )

      // A query typed into the recipes page, with the field still focused
      await browser.evaluate(`${pageSearch}.focus()`)
      await type(browser, pageSearch, "zz")
      await browser.waitFor(
        `document.body.textContent.includes("No recipes found")`,
      )

      await browser.press("k", "KeyK", 75, ctrl)
      await browser.waitFor(`document.activeElement === ${dialogInput}`)
      await type(browser, dialogInput, title)
      await browser.waitFor(
        `${dialog}.querySelector('[cmdk-item]')?.textContent.includes(${JSON.stringify(title)})`,
      )
      await browser.press("Escape", "Escape", 27)
      await browser.waitFor(
        `!${dialog} && document.activeElement === ${pageSearch}`,
      )
      assert.equal(await browser.evaluate(`location.pathname`), "/")
      assert.equal(await browser.evaluate(`${pageSearch}.value`), "zz")

      // From another screen, the shortcut opens an empty search, and the
      // page only changes once a result is picked
      await browser.click(
        `document.querySelector('nav[aria-label="Primary"] a[href="/groceries"]')`,
      )
      await browser.waitFor(`location.pathname === "/groceries"`)
      await browser.press("k", "KeyK", 75, ctrl)
      await browser.waitFor(`document.activeElement === ${dialogInput}`)
      assert.equal(await browser.evaluate(`${dialogInput}.value`), "")
      await type(browser, dialogInput, title)
      await browser.waitFor(
        `${dialog}.querySelector('[cmdk-item][data-selected="true"]')?.textContent.includes(${JSON.stringify(title)})`,
      )
      assert.equal(await browser.evaluate(`location.pathname`), "/groceries")
      await browser.press("Enter", "Enter", 13)
      await browser.waitFor(
        `location.pathname === "/recipes/${recipeId}" && !${dialog}`,
      )
      await browser.waitFor(
        `document.querySelector("main h1")?.textContent === ${JSON.stringify(title)}`,
      )
    }),
)
