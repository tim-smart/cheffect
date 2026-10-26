import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

// Opening a recipe from a scrolled recipe list must show the recipe page from
// the top in its first frame. If the page is painted at the list's scroll
// position first, the recipe's sticky header covers the app bar for a frame.
// Going back returns to the list where it was.
//
// Each page is checked when it enters the DOM. The observer runs once that
// commit's effects have run, in the same task, so the browser can't have
// painted yet: it sees the scroll position of the page's first frame.

// Resolves with the scroll position, and what's under the top bar, once an
// element matching or holding `selector` is added inside <main>. Each screen
// sits in its own wrapper, which can mount before the page inside it.
const onPageCommit = (selector: string) => `new Promise((resolve) => {
  const observer = new MutationObserver((records) => {
    if (!records.some((r) => [...r.addedNodes].some((n) => n.matches?.("${selector}") || n.querySelector?.("${selector}")))) return
    observer.disconnect()
    const atTopBar = document.elementFromPoint(innerWidth / 2, 20)
    resolve({
      scrollY: Math.round(scrollY),
      topBar: atTopBar?.closest("main header") ? "recipe header" : atTopBar?.closest("header") ? "app header" : "other",
    })
  })
  observer.observe(document.querySelector("main"), { childList: true, subtree: true })
})`

test(
  "a recipe opened from a scrolled list starts at the top, and back restores the list",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      // short enough for the seeded recipes to scroll
      await browser.setViewport(390, 420)
      await browser.navigate(`${base}/`)
      await browser.waitFor(
        `document.querySelectorAll('a[href^="/recipes/"]').length > 1`,
      )
      const listScrollY = await browser.evaluate<number>(
        `(scrollTo(0, document.documentElement.scrollHeight), Math.round(scrollY))`,
      )
      assert.ok(listScrollY > 100, `the list only scrolled ${listScrollY}px`)

      // open the last recipe in the list
      await browser.evaluate(`void (window.__opened = ${onPageCommit("h1")})`)
      await browser.click(
        `[...document.querySelectorAll('a[href^="/recipes/"]')].at(-1)`,
      )
      const opened = await browser.evaluate(`window.__opened`)
      assert.deepEqual(opened, { scrollY: 0, topBar: "app header" })

      // back to the list, where it was
      await browser.evaluate(
        `window.__back = ${onPageCommit("[aria-label='Sort recipes']")}; history.back()`,
      )
      const back = await browser.evaluate(`window.__back`)
      assert.deepEqual(back, { scrollY: listScrollY, topBar: "app header" })
    }),
)

// On a list longer than the virtualizer mounts, the rows above the restored
// position are never measured: they sit where the row-height estimate puts
// them. The estimate must match the measured rows before the first paint, or
// going back shows different recipes at the old scroll offset.

// The first recipe wholly in view: an expression for its link, and one for
// where it sits along with the page height.
const firstInView = `[...document.querySelectorAll('main a[href^="/recipes/"]')]
  .map((a) => ({ a, rect: a.getBoundingClientRect() }))
  .filter(({ rect }) => rect.top >= 0)
  .sort((x, y) => x.rect.top - y.rect.top)[0]`
const firstInViewAt = `(() => {
  const first = ${firstInView}
  return {
    title: first.a.querySelector("h3").textContent,
    top: Math.round(first.rect.top),
    scrollY: Math.round(scrollY),
    height: document.documentElement.scrollHeight,
  }
})()`
// Rows that mount in the list's first moments rise into place; true once
// nothing on the page is still moving
const tilesSettled = `document.getAnimations().every((a) => a.playState !== "running")`

test(
  "back from a recipe restores a long list to the same recipes",
  { skip: !hasChromium && "chromium not found", timeout: 240_000 },
  () =>
    withSeededApp(
      async ({ browser, base }) => {
        // wide enough for the measured row to differ from the first estimate
        await browser.setViewport(600, 844)
        await browser.navigate(`${base}/`)
        await browser.waitFor(`document.body.textContent.includes("84 saved")`)
        await browser.evaluate(
          `scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.7))`,
        )
        // the rows for the new offset mount on the scroll event
        await browser.waitFor(`!!(${firstInView}) && ${tilesSettled}`)
        const before = await browser.evaluate<{ scrollY: number }>(
          firstInViewAt,
        )
        assert.ok(before.scrollY > 0, "the list did not scroll")

        await browser.click(`(${firstInView}).a`)
        await browser.waitFor(
          `!document.querySelector('[aria-label="Sort recipes"]')`,
        )
        await browser.evaluate(`history.back()`)
        await browser.waitFor(
          `!!document.querySelector('[aria-label="Sort recipes"]')`,
        )
        // the router restores the scroll position on mount
        await browser.waitFor(`scrollY > 0 && ${tilesSettled}`)

        assert.deepEqual(await browser.evaluate(firstInViewAt), before)
      },
      { init: `localStorage.setItem("cheffect:devSeedPadding", "80")` },
    ),
)
