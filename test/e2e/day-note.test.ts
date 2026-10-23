import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, sleep, withSeededApp } from "./harness"

// A day's note on the meal plan and on a menu: the note button opens it
// focused, one press closes it, an immediate press opens it again, a press
// that slides off the button changes nothing, and leaving it empty closes it.
// The blur and the button's click must not both close the note, fight each
// other, or leave an empty note stranded when the press is cancelled.

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
const nothingPlanned = `${day}.textContent.includes("Nothing planned")`

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

  // a press that slides off the button leaves it open and focused
  await browser.cancelledPress(toggle, 120)
  await sleep(300)
  assert.deepEqual(await browser.evaluate(note), {
    open: true,
    focused: true,
  })

  // then clicking elsewhere closes the empty note
  await browser.click(`${day}.querySelector("p")`)
  await browser.waitFor(`!${note}.open`, 5000)
  assert.equal(await browser.evaluate(nothingPlanned), true)
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
