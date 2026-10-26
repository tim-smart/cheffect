import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

// Opening the meal plan from the tab bar. The screen must change once, to a
// page that already has its week: not a rebuilt recipes page first, nor the
// plan's header with the days following later. And a day's "Add a meal"
// button, which has no drawer behind it until it is first pressed, must open
// one from the keyboard as well as by touch.

const planTab = `[...document.querySelectorAll('nav a[href="/plan"]')].find((a) => a.getBoundingClientRect().height > 0)`
const planReady = `!!document.querySelector('main button[aria-label="Add a meal"]')`

// Records, for every screen the root's <main> gains while a navigation runs,
// what it held at that moment
const watchScreens = `(() => {
  window.__screens = []
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue
      window.__screens.push({
        recipes: !!node.querySelector('[aria-label="Sort recipes"]'),
        week: !!node.querySelector('button[aria-label="Add a meal"]'),
      })
    }
  }).observe(document.querySelector("main"), { childList: true })
  return true
})()`

test(
  "the meal plan arrives once, with its week, when its tab is tapped",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser }) => {
      await browser.waitFor(watchScreens)
      await browser.click(planTab)
      await browser.waitFor(planReady)
      assert.deepEqual(await browser.evaluate(`window.__screens`), [
        { recipes: false, week: true },
      ])
    }),
)

test(
  "a day's Add a meal button opens the recipe drawer by keyboard and by touch",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      // a phone: the drawer is taller than a small desktop window
      await browser.setViewport(390, 844)
      await browser.navigate(`${base}/plan`)
      await browser.waitFor(planReady)
      // the first day with nothing planned
      await browser.waitFor(`(() => {
        const empty = [...document.querySelectorAll("main p")].find((p) => p.textContent === "Nothing planned")
        if (!empty) return false
        empty.closest('[role="listitem"]').setAttribute("data-test-day", "")
        return true
      })()`)
      const day = `document.querySelector("[data-test-day]")`
      const button = `${day}.querySelector('button[aria-label="Add a meal"]')`
      const drawer = `document.querySelector('[role="dialog"]')`

      // Space opens it with the search focused; Escape closes it and hands
      // the focus back
      await browser.evaluate(`${button}.focus()`)
      await browser.press(" ", "Space", 32)
      await browser.waitFor(
        `!!${drawer} && document.activeElement === ${drawer}.querySelector("input")`,
        5000,
      )
      await browser.press("Escape", "Escape", 27)
      await browser.waitFor(`!${drawer}`, 5000)
      assert.equal(
        await browser.evaluate(`document.activeElement === ${button}`),
        true,
      )

      // a press opens it again, and picking a recipe plans it for the day
      await browser.click(button)
      // the drawer slides up from below the screen; wait until the first
      // recipe is on it before aiming at it
      await browser.waitFor(
        `(${drawer}?.querySelector('a[href^="/recipes/"]')?.getBoundingClientRect().bottom ?? Infinity) <= innerHeight`,
        5000,
      )
      const picked = await browser.evaluate<string>(
        `${drawer}.querySelector('a[href^="/recipes/"]').getAttribute("href")`,
      )
      await browser.click(`${drawer}.querySelector('a[href^="/recipes/"]')`)
      await browser.waitFor(
        `!${drawer} && !!${day}.querySelector('a[href^="/recipes/"]')`,
        5000,
      )
      assert.equal(
        await browser.evaluate(
          `${day}.querySelector('a[href^="/recipes/"]').getAttribute("href")`,
        ),
        picked,
      )
    }),
)
