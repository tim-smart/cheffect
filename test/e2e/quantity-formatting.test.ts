import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

test(
  "menus and meal plans round scaled servings like ingredient quantities",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async (t) =>
    withSeededApp(async ({ browser, base }) => {
      const href = await browser.evaluate<string>(
        `[...document.querySelectorAll('a[href^="/recipes/"]')].find((a) => a.textContent.includes("Lemon Herb Chicken")).getAttribute("href")`,
      )
      await browser.navigate(`${base}${href}`)
      const heading = `[...document.querySelectorAll("h2")].find((h) => h.textContent.includes("Ingredients"))`
      const options = `document.querySelector('button[aria-label="Ingredient options"]')`
      await browser.waitFor(`!!${options}`)
      await browser.click(options)
      await browser.waitFor(`!!document.querySelector('[role="menu"] input')`)
      await browser.evaluate(`(() => {
        const input = document.querySelector('[role="menu"] input')
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setValue.call(input, "1/3")
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      })()`)
      await browser.waitFor(`(${heading}).textContent.includes("scaled")`)

      // Let the scale event persist before a full-page navigation.
      await journalSettled(browser)

      await t.test("menu servings", async () => {
        await browser.navigate(`${base}/menus`)
        await browser.waitFor(`!!document.querySelector('a[href^="/menus/"]')`)
        const menuHref = await browser.evaluate<string>(
          `document.querySelector('a[href^="/menus/"]').getAttribute("href")`,
        )
        await browser.navigate(`${base}${menuHref}`)
        await browser.waitFor(
          `!!document.querySelector('a[href="${href}"] h4')`,
        )
        const details = await browser.evaluate<string>(
          `document.querySelector('a[href="${href}"] p').textContent`,
        )
        assert.ok(details.includes("1.33 servings"), details)
      })

      await t.test("meal plan servings", async () => {
        await browser.navigate(`${base}/plan`)
        await browser.waitFor(
          `!!document.querySelector('a[href="${href}"] h4')`,
        )
        const details = await browser.evaluate<string>(
          `document.querySelector('a[href="${href}"] p').textContent`,
        )
        assert.ok(details.includes("1.33 servings"), details)
      })
    }),
)
