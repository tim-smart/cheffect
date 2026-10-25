import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// Launching the installed app only focuses an open window, so a draft is
// kept. A share made while the app is open still reaches the import route,
// through the launch queue.
//
// The page can't be installed here, so a stand-in launch queue lets the test
// deliver launches the way the browser does to an open window.

const launchQueueStandIn = `(() => {
  let consumer
  Object.defineProperty(window, "launchQueue", {
    configurable: true,
    value: { setConsumer: (f) => { consumer = f } },
  })
  window.__launch = (targetURL) => consumer({ targetURL })
})()`

const recipeName = `document.querySelector("form input")`

test(
  "a launch keeps the open page and a share while open is imported",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.addInitScript(launchQueueStandIn)
      await browser.navigate(`${base}/settings`)
      await browser.waitFor(`!!document.querySelector("#openAiApiKey")`)
      await browser.evaluate(`(() => {
        const input = document.querySelector("#openAiApiKey")
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "test-api-key")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `document.querySelector("#openAiApiKey").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await journalSettled(browser)

      await browser.navigate(`${base}/add`)
      await browser.waitFor(`!!${recipeName}`)
      await browser.evaluate(`(() => {
        const input = ${recipeName}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "Draft soup")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)

      // The app icon launches the start URL
      await browser.evaluate(`window.__launch(${JSON.stringify(`${base}/`)})`)
      await new Promise((resolve) => setTimeout(resolve, 500))
      assert.deepEqual(
        await browser.evaluate(
          `({ path: location.pathname, draft: (${recipeName})?.value })`,
        ),
        { path: "/add", draft: "Draft soup" },
      )

      // Record page fetches without leaving the test machine
      await browser.evaluate(`(() => {
        window.__fetched = []
        window.fetch = async (input) => {
          window.__fetched.push(input instanceof Request ? input.url : String(input))
          return new Response("", { status: 404 })
        }
      })()`)
      const page = "https://recipe.example/grandma's-soup"
      const share = `${base}/import?${new URLSearchParams({ title: "Grandma's soup", url: page })}`
      await browser.evaluate(`window.__launch(${JSON.stringify(share)})`)
      await browser.waitFor(
        `window.__fetched.includes(${JSON.stringify(page)})`,
      )
      await browser.waitFor(`location.pathname === "/"`)
    }),
)
