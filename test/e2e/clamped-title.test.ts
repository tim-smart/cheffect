import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, withSeededApp } from "./harness"

// The menu and recipe edit titles are clamped, which hides whatever spills
// out of the heading. On desktops the title is set in Fraunces, whose
// descenders reach below a 1em line, so too tight a line cuts off the tails
// of letters like "g" and "y".
//
// The text's own boxes span the font's ascent and descent, so each must sit
// inside the heading for nothing to be cut off.

const overflow = `document.fonts.ready.then(() => {
  const title = document.querySelector("main h1")
  const range = document.createRange()
  range.selectNodeContents(title)
  const bottom = title.getBoundingClientRect().bottom
  return Math.max(...[...range.getClientRects()].map((r) => r.bottom - bottom))
})`

const assertFits = async (browser: Browser) => {
  const spill = await browser.evaluate<number>(overflow)
  assert.ok(spill <= 0.5, `the title's text reaches ${spill}px below it`)
}

test(
  "clamped page titles leave room for descenders",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.setViewport(1280, 900, { mobile: false })

      await browser.navigate(`${base}/menus`)
      await browser.waitFor(`!!document.querySelector('a[href^="/menus/"]')`)
      const menuHref = await browser.evaluate<string>(
        `document.querySelector('a[href^="/menus/"]').getAttribute("href")`,
      )
      await browser.navigate(`${base}${menuHref}`)
      await browser.waitFor(`!!document.querySelector("main h1")?.textContent`)
      await assertFits(browser)

      await browser.navigate(`${base}/edit/${recipeId}`)
      await browser.waitFor(`!!document.querySelector("main h1")?.textContent`)
      await assertFits(browser)
    }),
)
