import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, sleep, withSeededApp } from "./harness"

test(
  "AI chat model is separate, persists, and controls chat requests",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.navigate(`${base}/settings`)
      await browser.waitFor(`!!document.querySelector("#openAiModel")`)
      const chatInput = `document.getElementById([...document.querySelectorAll("label")].find((label) => label.textContent === "AI chat model")?.htmlFor)`
      const settings = await browser.evaluate<{
        chat: string | null
        existing: string
        chatAboveExisting: boolean
      }>(`(() => {
        const chat = ${chatInput}
        const existing = document.querySelector("#openAiModel")
        return {
          chat: chat?.value ?? null,
          existing: existing.value,
          chatAboveExisting: !!chat && !!(chat.compareDocumentPosition(existing) & Node.DOCUMENT_POSITION_FOLLOWING),
        }
      })()`)
      assert.equal(settings.chat, "gpt-6.1-sol", "new chat model default")
      assert.equal(settings.existing, "gpt-5.4", "existing model is unchanged")
      assert.ok(
        settings.chatAboveExisting,
        "chat model appears above existing model",
      )

      const setInput = async (element: string, value: string) => {
        await browser.evaluate(`(() => {
          const input = ${element}
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)})
          input.dispatchEvent(new Event("input", { bubbles: true }))
        })()`)
        // A separate call lets React render before committing the field.
        await browser.evaluate(
          `(${element}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
        )
      }
      await setInput(chatInput, "chat-model-for-test")
      await setInput(`document.querySelector("#openAiApiKey")`, "test-api-key")
      await sleep(2000)
      await browser.navigate(`${base}/settings`)
      await browser.waitFor(`!!document.querySelector("#openAiModel")`)
      assert.equal(
        await browser.evaluate(`(${chatInput}).value`),
        "chat-model-for-test",
      )
      assert.equal(
        await browser.evaluate(`document.querySelector("#openAiModel").value`),
        "gpt-5.4",
      )

      // Observe the public HTTP boundary without contacting OpenAI.
      await browser.evaluate(`(() => {
        window.__chatRequests = []
        const originalFetch = window.fetch
        window.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input)
          if (url.startsWith("https://api.openai.com/")) {
            const body = input instanceof Request ? await input.clone().text() : await new Response(init.body).text()
            window.__chatRequests.push(JSON.parse(body))
            return new Response(JSON.stringify({ error: { message: "Test intercepted request", type: "invalid_request_error" } }), { status: 400, headers: { "content-type": "application/json" } })
          }
          return originalFetch(input, init)
        }
      })()`)
      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.waitFor(
        `!!document.querySelector('textarea[placeholder="Type your message..."]')`,
      )
      await browser.evaluate(`(() => {
        const input = document.querySelector('textarea[placeholder="Type your message..."]')
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Hello chef")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `document.querySelector('textarea[placeholder="Type your message..."]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await browser.waitFor(`window.__chatRequests.length > 0`)
      assert.equal(
        await browser.evaluate(`window.__chatRequests[0].model`),
        "chat-model-for-test",
        "chat uses the saved chat model, not the existing helper model",
      )

      // Keep the same page session and initialized chat runtime while editing.
      await browser.waitFor(
        `document.querySelector('textarea[placeholder="Type your message..."]').closest("form").querySelector('button[type="submit"]').disabled`,
      )
      await browser.click(
        `document.querySelector(".lucide-x").closest("button")`,
      )
      await setInput(chatInput, "second-chat-model")
      await sleep(2000)
      assert.equal(
        await browser.evaluate(`(${chatInput}).value`),
        "second-chat-model",
      )
      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.evaluate(`(() => {
        const input = document.querySelector('textarea[placeholder="Type your message..."]')
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Hello again chef")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `document.querySelector('textarea[placeholder="Type your message..."]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await browser.waitFor(`window.__chatRequests.length > 1`)
      assert.equal(
        await browser.evaluate(`window.__chatRequests[1].model`),
        "second-chat-model",
        "chat uses a changed model after the first request without reloading",
      )
    }),
)
