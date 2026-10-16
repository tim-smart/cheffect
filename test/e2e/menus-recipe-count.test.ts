import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, withSeededApp } from "./harness"

// A menu's recipe count needs the menu entries as well as the menus, so the
// menu list can show before the counts load. A count that hasn't loaded must
// not read as "0 recipes", while a menu that really has no recipes still
// does.
//
// The menu entries read is held until the test releases it, so the menu list
// is on screen with its counts still loading.

const holdMenuEntries = `(() => {
  window.__releaseMenuEntries = []
  const getAll = IDBObjectStore.prototype.getAll
  IDBObjectStore.prototype.getAll = function (...args) {
    const request = getAll.apply(this, args)
    if (this.name !== "menuEntries") return request
    let onsuccess = null
    Object.defineProperty(request, "onsuccess", {
      get: () => onsuccess,
      set: (f) => { onsuccess = f },
    })
    request.addEventListener("success", (event) => {
      window.__releaseMenuEntries.push(() => onsuccess?.call(request, event))
    })
    return request
  }
})()`

const card = (name: string) =>
  `[...document.querySelectorAll('main a[href^="/menus/"]')].find((a) => a.querySelector("h3")?.textContent === "${name}")`

test(
  "a menu's recipe count isn't shown as zero while it loads, and a real zero is",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      // a fresh document that hasn't read the menus yet
      await browser.evaluate(
        `localStorage.setItem("cheffect:skipDevSeed", "1")`,
      )
      await browser.navigate(`${base}/`)
      await browser.waitFor(`!!document.querySelector('a[href^="/recipes/"]')`)
      await browser.evaluate(holdMenuEntries)
      await browser.click(`document.querySelector('nav a[href="/menus"]')`)

      // the seeded menu is listed, its count still loading
      await browser.waitFor(
        `!!${card("Weeknight Rotation")} && window.__releaseMenuEntries.length > 0`,
      )
      const pending = await browser.evaluate<string>(
        `${card("Weeknight Rotation")}.innerText`,
      )
      assert.doesNotMatch(pending, /\b0 recipes\b/)

      // once the entries load, the real count shows
      await browser.evaluate(
        `window.__releaseMenuEntries.forEach((release) => release())`,
      )
      await browser.waitFor(
        `/\\b5 recipes\\b/.test(${card("Weeknight Rotation")}?.innerText)`,
      )

      // a new menu has no recipes, and says so
      await browser.click(
        `[...document.querySelectorAll("main header button")].find((b) => b.textContent.includes("New"))`,
      )
      await browser.waitFor(
        `!!document.querySelector('input[placeholder="Menu name"]')`,
      )
      await browser.evaluate(`(() => {
        const input = document.querySelector('input[placeholder="Menu name"]')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "Empty menu")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.click(
        `document.querySelector('input[placeholder="Menu name"]').form.querySelector('button[type="submit"]')`,
      )
      await browser.waitFor(
        `/\\b0 recipes\\b/.test(${card("Empty menu")}?.innerText)`,
      )
    }),
)
