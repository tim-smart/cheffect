import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, sleep, withSeededApp } from "./harness"

// Deleting a recipe from a recipe page that was opened directly (by URL)
// calls history.back(), which unloads the document straight after the commit.
// The deletion must still be persisted.

test(
  "a recipe deleted from a directly opened recipe page stays deleted",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId: id }) => {
      // open the recipe page directly and delete it from the menu
      await browser.navigate(`${base}/recipes/${id}`)
      await browser.waitFor(`document.querySelectorAll("h1").length > 1`)
      // the last h1 is the recipe title, the first is the app header
      const recipeTitle = `[...document.querySelectorAll("h1")].at(-1)`
      const title = await browser.evaluate<string>(`${recipeTitle}.textContent`)
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
      await sleep(2000)

      // deleted recipes are left out of the recipe list (the recipe page
      // itself still renders them)
      await browser.navigate(`${base}/`)
      await browser.waitFor(`!!document.querySelector('a[href^="/recipes/"]')`)
      const listed = await browser.evaluate<boolean>(
        `!!document.querySelector('a[href="/recipes/${id}"]')`,
      )
      assert.ok(!listed, `deleted recipe "${title}" is still listed`)
    }),
)
