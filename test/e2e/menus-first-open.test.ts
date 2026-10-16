import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, sleep, withSeededApp } from "./harness"

// The first time the menus screen opens in a session its data is still
// loading. The screen must show straight away rather than wait out React's
// 300ms Suspense reveal throttle.

test(
  "the menus screen shows without waiting for its data on first open",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      // a fresh document that hasn't read the menus yet
      await browser.evaluate(
        `localStorage.setItem("cheffect:skipDevSeed", "1")`,
      )
      await browser.navigate(`${base}/`)
      await browser.waitFor(`!!document.querySelector('a[href^="/recipes/"]')`)
      await sleep(1000)

      // click the nav link and wait a frame at a time for the menus header
      const elapsed = await browser.evaluate<number>(`new Promise((resolve) => {
        const start = performance.now()
        document.querySelector('nav a[href="/menus"]').click()
        const frame = () => {
          const elapsed = performance.now() - start
          const shown = [...document.querySelectorAll("main h1")].some(
            (h1) => h1.textContent.trim() === "Menus",
          )
          if (shown || elapsed > 5000) resolve(elapsed)
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })`)
      assert.ok(
        elapsed < 200,
        `menus header took ${Math.round(elapsed)}ms to show`,
      )

      // the seeded menu still loads
      await browser.waitFor(`!!document.querySelector('a[href^="/menus/"]')`)
    }),
)
