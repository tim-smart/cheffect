import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// Saving a recipe from an edit page, or deleting it from a recipe page, that
// was opened directly (by URL) calls history.back(), which unloads the
// document straight after the commit. The write must still be persisted.

test(
  "an edit or delete from a directly opened page is persisted",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId: id }) => {
      // open the edit page directly, change the title and save
      await browser.navigate(`${base}/edit/${id}`)
      await browser.waitFor(`!!document.querySelector('input[name="title"]')`)
      const original = await browser.evaluate<string>(
        `document.querySelector('input[name="title"]').value`,
      )
      await browser.evaluate(`(() => {
        const input = document.querySelector('input[name="title"]')
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setValue.call(input, "Edited after direct open")
        input.dispatchEvent(new Event("input", { bubbles: true }))
        document.querySelector('form button[type="submit"]').click()
      })()`)
      await browser.waitFor(`!location.pathname.startsWith("/edit/")`, 15_000)
      await journalSettled(browser)

      await browser.navigate(`${base}/recipes/${id}`)
      const titles = JSON.stringify([original, "Edited after direct open"])
      await browser.waitFor(
        `[...document.querySelectorAll("h1")].some((h1) => ${titles}.includes(h1.textContent))`,
      )
      const shown = await browser.evaluate<Array<string>>(
        `[...document.querySelectorAll("h1")].map((h1) => h1.textContent)`,
      )
      assert.ok(
        shown.includes("Edited after direct open"),
        `recipe still shows ${JSON.stringify(shown)}`,
      )

      // the recipe page was opened directly too: delete it from the menu
      // the last h1 is the recipe title, the first is the app header
      const recipeTitle = `[...document.querySelectorAll("h1")].at(-1)`
      await browser.click(
        `${recipeTitle}.closest("header").querySelector('button[aria-haspopup="menu"]')`,
      )
      await browser.waitFor(
        `[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent === "Remove")`,
      )
      // confirm() is accepted by the harness
      await browser.evaluate(
        `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === "Remove").click()`,
      )
      await browser.waitFor(
        `!location.pathname.startsWith("/recipes/")`,
        15_000,
      )
      await journalSettled(browser)

      // deleted recipes are left out of the recipe list (the recipe page
      // itself still renders them)
      await browser.navigate(`${base}/`)
      await browser.waitFor(`!!document.querySelector('a[href^="/recipes/"]')`)
      const listed = await browser.evaluate<boolean>(
        `!!document.querySelector('a[href="/recipes/${id}"]')`,
      )
      assert.ok(!listed, "the deleted recipe is still listed")
    }),
)
