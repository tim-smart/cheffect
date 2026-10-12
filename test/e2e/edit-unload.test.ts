import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, sleep, withSeededApp } from "./harness"

// Saving a recipe from an edit page that was opened directly (by URL) calls
// history.back(), which unloads the document straight after the commit. The
// edit must still be persisted.

test(
  "an edit saved from a directly opened edit page is persisted",
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
      await sleep(2000)

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
    }),
)
