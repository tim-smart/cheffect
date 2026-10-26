import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  type Browser,
  hasChromium,
  journalSettled,
  withSeededApp,
} from "./harness"

// The add recipe menu keeps its imports without an OpenAI API key, and they
// lead to the AI settings instead. With a key they import as before.

const trigger = `document.querySelector('button[aria-label="Add recipe"]')`
const menuItems = `[...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)`
const menuItem = (text: string) =>
  `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === ${JSON.stringify(text)})`

const openMenu = async (browser: Browser, base: string) => {
  await browser.navigate(`${base}/`)
  await browser.waitFor(`!!${trigger}`)
  await browser.click(trigger)
  await browser.waitFor(`!!(${menuItem("From scratch")})`)
}

test(
  "recipe imports lead to the AI settings until AI is set up",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      // the seeded app has no API key
      for (const item of ["From URL", "From images"]) {
        await openMenu(browser, base)
        await browser.waitFor(
          `${menuItems}.join() === "From URL,From images,From scratch"`,
        )
        await browser.evaluate(`(${menuItem(item)}).click()`)
        await browser.waitFor(`location.pathname === "/settings"`)
        await browser.waitFor(`!!document.querySelector("#openAiApiKey")`)
        assert.equal(
          await browser.evaluate(`!!document.querySelector('[role="dialog"]')`),
          false,
          `${item} must not start an import`,
        )
      }

      await browser.evaluate(`(() => {
        const input = document.getElementById("openAiApiKey")
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "test-api-key")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `document.getElementById("openAiApiKey").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await journalSettled(browser)

      await openMenu(browser, base)
      await browser.waitFor(`!!(${menuItem("From URL")})`)
      await browser.evaluate(`(${menuItem("From URL")}).click()`)
      await browser.waitFor(
        `document.querySelector('[role="dialog"]')?.textContent.includes("Add from a link")`,
      )
      assert.equal(await browser.evaluate(`location.pathname`), "/")
    }),
)
