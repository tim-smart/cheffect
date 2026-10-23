import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, sleep, withSeededApp } from "./harness"

// A day's note on the meal plan and on a menu: the note button opens it
// focused, one press closes it, an immediate press opens it again, and
// leaving it empty closes it. Pressing the button blurs the field first, so
// the blur and the click must not both close the note, or fight each other.

// Marks the first empty day, so the steps below keep finding the same one,
// and brings it on screen: clicks land on screen coordinates
const markEmptyDay = `(() => {
  const empty = [...document.querySelectorAll("main p")].find(
    (p) => p.textContent === "Nothing planned",
  )
  let day = empty.parentElement
  while (!day.querySelector('button[aria-label="Add a note"]')) {
    day = day.parentElement
  }
  day.setAttribute("data-test-day", "")
  day.scrollIntoView({ block: "center" })
  return true
})()`
const day = `document.querySelector("[data-test-day]")`
const toggle = `${day}.querySelector('button[aria-label$=" note"]')`
const field = `${day}.querySelector("textarea")`
const note = `({ open: !!${field}, focused: !!${field} && document.activeElement === ${field} })`

const checkNote = async (browser: Browser) => {
  await browser.waitFor(markEmptyDay)

  await browser.click(toggle)
  await browser.waitFor(`${note}.focused`, 5000)

  // one press closes it, and it stays closed
  await browser.click(toggle)
  await browser.waitFor(`!${note}.open`, 5000)
  await sleep(300)
  assert.deepEqual(await browser.evaluate(note), {
    open: false,
    focused: false,
  })

  // a press straight after closing opens it again
  await browser.click(toggle)
  await browser.waitFor(`${note}.focused`, 5000)
  await browser.click(toggle)
  await browser.click(toggle)
  await browser.waitFor(`${note}.focused`, 5000)

  // leaving it empty closes it
  await browser.evaluate(`document.activeElement.blur()`)
  await browser.waitFor(`!${note}.open`, 5000)
}

test(
  "a day's note opens, closes and reopens with single presses of its button",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/plan`)
      await checkNote(browser)

      await browser.navigate(`${base}/menus`)
      await browser.waitFor(`!!document.querySelector('a[href^="/menus/"]')`)
      const menuHref = await browser.evaluate<string>(
        `document.querySelector('a[href^="/menus/"]').getAttribute("href")`,
      )
      await browser.navigate(`${base}${menuHref}`)
      await checkNote(browser)
    }),
)
