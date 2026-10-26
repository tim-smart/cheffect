import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

// A recipe photo that fails to load must leave the chef-hat placeholder in
// its thumbnail, not an empty square. The meal plan and menu pages render
// their own thumbnails, so each is checked.
//
// The photo is made to fail by pointing the first thumbnail at a URL that
// can't be an image; the browser then fires the same error event a 404 does.

const thumbnail = `document.querySelector('main a[href^="/recipes/"] img')`

// Resolves with what the thumbnail shows once the photo has failed: whether
// the photo is still drawn, and whether the middle of the thumbnail now shows
// the chef hat's drawing.
const failPhoto = `new Promise((resolve) => {
  const img = ${thumbnail}
  const rect = img.getBoundingClientRect()
  img.addEventListener("error", () => requestAnimationFrame(() => {
    const shown = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    resolve({
      photoShown: img.checkVisibility(),
      hatShown: !!shown?.closest("svg"),
    })
  }), { once: true })
  img.src = "data:text/plain,not-an-image"
})`

const expected = { photoShown: false, hatShown: true }

test(
  "a recipe photo that fails to load shows the placeholder in its thumbnail",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/plan`)
      await browser.waitFor(`!!${thumbnail}`)
      assert.deepEqual(await browser.evaluate(failPhoto), expected)

      await browser.navigate(`${base}/menus`)
      await browser.waitFor(`!!document.querySelector('a[href^="/menus/"]')`)
      const menuHref = await browser.evaluate<string>(
        `document.querySelector('a[href^="/menus/"]').getAttribute("href")`,
      )
      await browser.navigate(`${base}${menuHref}`)
      await browser.waitFor(`!!${thumbnail}`)
      assert.deepEqual(await browser.evaluate(failPhoto), expected)
    }),
)
