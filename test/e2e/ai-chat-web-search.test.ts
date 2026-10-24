import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"
import fixture from "../fixtures/openai-web-search-stream.json" with { type: "json" }

// OpenAI runs web searches itself, so their results arrive in the assistant
// message rather than a tool message. They show as activity rows, and an
// assistant message without text doesn't leave an empty bubble.

const sse = fixture
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join("")

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`

test(
  "AI chat shows web search calls as activity rows",
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
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "What is in season?")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `(${input}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await browser.waitFor(
        `document.body.textContent.includes("Pumpkins are in season.") && (${input}).closest("form").querySelector('button[type="submit"]').disabled`,
      )

      const rendered = await browser.evaluate<{
        rows: Array<string>
        bubbles: Array<string>
      }>(`(() => {
        const messages = document.querySelector(".lucide-globe").closest(".overflow-y-auto")
        return {
          rows: [...messages.querySelectorAll(".lucide-globe")].map((icon) => icon.parentElement.textContent),
          bubbles: [...messages.querySelectorAll(".rounded-2xl")].map((bubble) => bubble.textContent.trim()),
        }
      })()`)
      assert.deepEqual(rendered.rows, [
        "Searched the web for “autumn produce”",
        "Opened a web page",
        "Searched example.com",
        "Searched the web",
      ])
      assert.deepEqual(rendered.bubbles, [
        "What is in season?",
        "Pumpkins are in season.",
      ])
    }),
)
