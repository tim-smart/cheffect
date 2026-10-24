import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, withSeededApp } from "./harness"

// The menu and recipe edit titles are clamped, which hides whatever spills
// out of the heading. On desktops the title is set in Fraunces, whose
// descenders reach below a 1em line, so too tight a line cuts off the tails
// of letters like "g" and "y".
//
// The text's own boxes span the font's ascent and descent, one per line. A
// line the heading shows must fit inside it, and a line past the clamp must
// be hidden entirely rather than peek in at the bottom.

const titleLines = `document.fonts.ready.then(() => {
  const title = document.querySelector("main h1")
  const range = document.createRange()
  range.selectNodeContents(title)
  const bottom = title.getBoundingClientRect().bottom
  const shown = [...range.getClientRects()].filter((r) => r.top < bottom)
  return {
    shown: new Set(shown.map((r) => Math.round(r.top))).size,
    spill: Math.max(...shown.map((r) => r.bottom - bottom)),
  }
})`

const assertFits = async (browser: Browser, lines: number) => {
  const { shown, spill } = await browser.evaluate<{
    shown: number
    spill: number
  }>(titleLines)
  assert.equal(shown, lines, "lines of the title shown")
  assert.ok(spill <= 0.5, `the title's text reaches ${spill}px below it`)
}

const longName =
  "Slow-cooked pulled pork with spicy grilled veggies, yoghurt dressing and a big bowl of crispy fried pappadums for everybody, plus mango lassi and a gingery pineapple pudding to finish things up nicely on a Saturday night"

const menuLink = (name: string) =>
  `[...document.querySelectorAll('main a[href^="/menus/"]')].find((a) => a.querySelector("h3")?.textContent === "${name}")`

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
      await assertFits(browser, 1)

      // a menu name too long for two lines is cut off after the second
      await browser.navigate(`${base}/menus`)
      await browser.waitFor(`!!document.querySelector('a[href^="/menus/"]')`)
      await browser.click(
        `[...document.querySelectorAll("main header button")].find((b) => b.textContent.includes("New"))`,
      )
      await browser.waitFor(
        `!!document.querySelector('input[placeholder="Menu name"]')`,
      )
      await browser.evaluate(`(() => {
        const input = document.querySelector('input[placeholder="Menu name"]')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(longName)})
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.click(
        `document.querySelector('input[placeholder="Menu name"]').form.querySelector('button[type="submit"]')`,
      )
      await browser.waitFor(`!!${menuLink(longName)}`)
      await browser.click(menuLink(longName))
      await browser.waitFor(
        `document.querySelector("main h1")?.textContent === ${JSON.stringify(longName)}`,
      )
      await assertFits(browser, 2)

      await browser.navigate(`${base}/edit/${recipeId}`)
      await browser.waitFor(`!!document.querySelector("main h1")?.textContent`)
      await assertFits(browser, 1)
    }),
)
