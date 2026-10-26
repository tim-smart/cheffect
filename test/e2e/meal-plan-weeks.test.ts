import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  type Browser,
  hasChromium,
  journalSettled,
  withSeededApp,
} from "./harness"

// The meal plan keeps its seven day rows while the weeks change under them,
// so what a row holds has to go with the day, not the row: a note being
// typed on one week must not stay focused with the next week's note in it.
// A meal's menu mounts on its first press, and that first press from the
// keyboard must still land on the menu's first action.

const weekLabel = `document.querySelector("main header h2").textContent`

// The row of the named weekday, found afresh each time, so the check doesn't
// depend on the rows being kept
const dayRow = (weekday: string) =>
  `[...document.querySelectorAll("main p")].find((p) => p.textContent === ${JSON.stringify(weekday)})?.closest('[role="listitem"]')`

// The weekday of the first day with nothing planned
const emptyWeekday = `(() => {
  const empty = [...document.querySelectorAll("main p")].find((p) => p.textContent === "Nothing planned")
  return empty.closest('[role="listitem"]').querySelector("p").textContent
})()`

const weekButton = (to: "Next" | "Previous") =>
  `document.querySelector('button[aria-label="${to} week"]')`

// Waits for the week heading to change from `label`
const weekChanged = (browser: Browser, label: string) =>
  browser.waitFor(`${weekLabel} !== ${JSON.stringify(label)}`, 5000)

// Opens the weekday's note, types into it and leaves it, which saves it
const writeNote = async (browser: Browser, weekday: string, text: string) => {
  const row = dayRow(weekday)
  await browser.click(`${row}.querySelector('button[aria-label="Add a note"]')`)
  await browser.waitFor(
    `document.activeElement === ${row}.querySelector("textarea")`,
    5000,
  )
  await browser.evaluate(
    `document.execCommand("insertText", false, ${JSON.stringify(text)})`,
  )
  await browser.click(`${row}.querySelector("p")`)
  await journalSettled(browser)
}

test(
  "a note focused on one week is not left focused when the week changes",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/plan`)
      await browser.waitFor(
        `!!document.querySelector('button[aria-label="Add a meal"]')`,
      )
      const weekday = await browser.evaluate<string>(emptyWeekday)
      const row = dayRow(weekday)
      const field = `${row}?.querySelector("textarea")`

      // the same weekday gets a note on last week and on this week
      const thisWeek = await browser.evaluate<string>(weekLabel)
      await browser.click(weekButton("Previous"))
      await weekChanged(browser, thisWeek)
      const lastWeek = await browser.evaluate<string>(weekLabel)
      await writeNote(browser, weekday, "Last week")
      await browser.click(weekButton("Next"))
      await weekChanged(browser, lastWeek)
      await writeNote(browser, weekday, "This week")
      await browser.click(weekButton("Previous"))
      await weekChanged(browser, thisWeek)

      // typing in last week's note, then a swipe forward to this week. (A
      // swipe, not the button: a press would take the focus itself. Forward,
      // because a swipe back is also the browser's gesture for history)
      await browser.click(field)
      await browser.waitFor(`document.activeElement === ${field}`, 5000)
      const firstDay = `document.querySelector('main [role="listitem"]')`
      await browser.evaluate(`${firstDay}.scrollIntoView({ block: "center" })`)
      await browser.swipe(firstDay, -200)
      await weekChanged(browser, lastWeek)

      assert.deepEqual(
        await browser.evaluate(
          `({ week: ${weekLabel}, value: ${field}?.value ?? null, focused: !!${field} && document.activeElement === ${field} })`,
        ),
        { week: thisWeek, value: "This week", focused: false },
      )
    }),
)

test(
  "the first keyboard opening of a meal's menu focuses its first action",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/plan`)
      const button = `document.querySelector('button[aria-label="Meal options"]')`
      await browser.waitFor(`!!${button}`)
      await browser.evaluate(`${button}.focus()`)
      await browser.press(" ", "Space", 32)
      await browser.waitFor(`!!document.querySelector('[role="menu"]')`, 5000)

      assert.deepEqual(
        await browser.evaluate(
          `({ role: document.activeElement.getAttribute("role"), text: document.activeElement.textContent })`,
        ),
        { role: "menuitem", text: "Change day" },
      )
    }),
)
