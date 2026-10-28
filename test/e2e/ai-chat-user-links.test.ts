import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"
import fixture from "../fixtures/openai-web-search-stream.json" with { type: "json" }

// A link the user sends is drawn in the bubble's text color. Markdown links
// default to the primary color, which is also the user bubble's background.

const sse = fixture
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join("")

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`

test(
  "AI chat shows links in user messages",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async () =>
    withSeededApp(async ({ browser, base }) => {
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

      await browser.evaluate(`(() => {
        const sse = ${JSON.stringify(sse)}
        const originalFetch = window.fetch
        window.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input)
          if (url.startsWith("https://api.openai.com/")) {
            return new Response(sse, { headers: { "content-type": "text/event-stream" } })
          }
          return originalFetch(input, init)
        }
      })()`)
      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.waitFor(`!!${input}`)
      await browser.evaluate(`(() => {
        const input = ${input}
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "You can use https://example.com/fried-chicken for the quantities.")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `(${input}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await browser.waitFor(
        `!!document.querySelector('[role="log"] [role="article"] a[href="https://example.com/fried-chicken"]')`,
      )

      const colors = await browser.evaluate<{
        bubble: string
        text: string
        link: string
      }>(`(() => {
        const link = document.querySelector('[role="log"] [role="article"] a[href="https://example.com/fried-chicken"]')
        const bubble = getComputedStyle(link.closest('[role="article"]'))
        return { bubble: bubble.backgroundColor, text: bubble.color, link: getComputedStyle(link).color }
      })()`)
      assert.notEqual(
        colors.link,
        colors.bubble,
        "the link is the color of the bubble",
      )
      assert.equal(colors.link, colors.text)
    }),
)
