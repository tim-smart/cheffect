import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"
import fixture from "../fixtures/openai-web-search-stream.json" with { type: "json" }

const sse = fixture
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join("")
const input = `document.querySelector('textarea[placeholder="Type your message..."]')`
const submit = `(${input}).closest("form").querySelector('button[type="submit"]')`
const bubbles = `[...(${input}).closest("form").parentElement.querySelectorAll(".rounded-2xl")].map((bubble) => bubble.textContent.trim())`

test(
  "changing OpenAI settings does not replay chat and applies to the next send",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/settings`)
      await browser.waitFor(`!!document.querySelector("#openAiApiKey")`)
      const setSetting = async (id: string, value: string) => {
        await browser.evaluate(`(() => {
          const input = document.getElementById(${JSON.stringify(id)})
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)})
          input.dispatchEvent(new Event("input", { bubbles: true }))
        })()`)
        await browser.evaluate(
          `document.getElementById(${JSON.stringify(id)}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
        )
        await journalSettled(browser)
      }
      await setSetting("openAiApiKey", "test-api-key")

      // Only the HTTP boundary is replaced; settings and chat use the real app.
      await browser.evaluate(`(() => {
        window.__chatRequests = []
        const originalFetch = window.fetch
        window.fetch = async (input, init) => {
          const request = new Request(input, init)
          if (request.url.startsWith("https://api.openai.com/") || request.url.startsWith("https://llm.example.com/")) {
            window.__chatRequests.push({
              url: request.url,
              authorization: request.headers.get("authorization"),
              body: JSON.parse(await request.text()),
            })
            return new Response(${JSON.stringify(sse)}, { headers: { "content-type": "text/event-stream" } })
          }
          return originalFetch(input, init)
        }
      })()`)
      const send = async (text: string) => {
        await browser.evaluate(`(() => {
          const input = ${input}
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, ${JSON.stringify(text)})
          input.dispatchEvent(new Event("input", { bubbles: true }))
        })()`)
        await browser.evaluate(
          `(${input}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
        )
        await browser.waitFor(
          `(${submit}).disabled && document.body.textContent.includes("Pumpkins are in season.")`,
        )
        await journalSettled(browser)
      }
      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.waitFor(`!!${input}`)
      await send("What is in season?")
      assert.equal(await browser.evaluate(`window.__chatRequests.length`), 1)
      assert.deepEqual(await browser.evaluate(bubbles), [
        "What is in season?",
        "Pumpkins are in season.",
      ])

      // Keep the same page and chat session while editing, just as a user does.
      await browser.click(
        `document.querySelector('button[aria-label="Minimize chat"]')`,
      )
      for (const [id, value] of [
        ["openAiModel", "replacement-extraction-model"],
        ["openAiApiKey", "replacement-api-key"],
        ["openAiApiUrl", "https://llm.example.com/v1"],
        ["aiChatModel", "replacement-chat-model"],
      ]) {
        await setSetting(id, value)
        assert.equal(
          await browser.evaluate(`window.__chatRequests.length`),
          1,
          `${id} must not resend the previous message`,
        )
        assert.deepEqual(await browser.evaluate(bubbles), [
          "What is in season?",
          "Pumpkins are in season.",
        ])
      }

      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await send("And next month?")
      assert.equal(await browser.evaluate(`window.__chatRequests.length`), 2)
      assert.deepEqual(
        await browser.evaluate(`(() => {
          const request = window.__chatRequests[1]
          return {
            // the path under the API URL is the client library's
            underApiUrl: request.url.startsWith("https://llm.example.com/v1/"),
            authorization: request.authorization,
            model: request.body.model,
            users: request.body.input.filter((message) => message.role === "user").flatMap((message) => message.content.map((part) => part.text)),
          }
        })()`),
        {
          underApiUrl: true,
          authorization: "Bearer replacement-api-key",
          model: "replacement-chat-model",
          users: ["What is in season?", "And next month?"],
        },
      )
      assert.deepEqual(await browser.evaluate(bubbles), [
        "What is in season?",
        "Pumpkins are in season.",
        "And next month?",
        "Pumpkins are in season.",
      ])
    }),
)
