import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// An image pasted into the chat input is attached and sent with the message.
// A paste with text on the clipboard is left to paste the text.

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`

// A 1x1 PNG
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const paste = (data: { readonly text?: string; readonly image: boolean }) =>
  `(() => {
    const data = new DataTransfer()
    ${data.text === undefined ? "" : `data.setData("text/plain", ${JSON.stringify(data.text)})`}
    if (${data.image}) {
      const bytes = Uint8Array.from(atob(${JSON.stringify(png)}), (c) => c.charCodeAt(0))
      data.items.add(new File([bytes], "image.png", { type: "image/png" }))
    }
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })
    ;(${input}).dispatchEvent(event)
    return event.defaultPrevented
  })()`

const attached = `[...document.querySelectorAll("form img")].map((img) => img.alt)`

test(
  "AI chat sends pasted images",
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
        window.__chatRequests = []
        const originalFetch = window.fetch
        window.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input)
          if (url.startsWith("https://api.openai.com/")) {
            const body = input instanceof Request ? await input.clone().text() : await new Response(init.body).text()
            window.__chatRequests.push(body)
            return new Response(JSON.stringify({ error: { message: "Test intercepted request", type: "invalid_request_error" } }), { status: 400, headers: { "content-type": "application/json" } })
          }
          return originalFetch(input, init)
        }
      })()`)
      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.waitFor(`!!${input}`)

      assert.equal(
        await browser.evaluate(paste({ text: "1 cup flour", image: true })),
        false,
        "text on the clipboard pastes as usual",
      )
      assert.equal(
        await browser.evaluate(paste({ image: true })),
        true,
        "a pasted image doesn't paste into the text",
      )
      await browser.waitFor(`${attached}.length === 1`)
      await browser.evaluate(paste({ image: true }))
      await browser.waitFor(`${attached}.length === 2`)
      assert.deepEqual(await browser.evaluate(attached), [
        "Pasted image.png",
        "Pasted image 2.png",
      ])

      await browser.evaluate(`(() => {
        const input = ${input}
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "What can I make with this?")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `(${input}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await browser.waitFor(`window.__chatRequests.length > 0`)
      const request = await browser.evaluate<string>(`window.__chatRequests[0]`)
      assert.equal(
        request.split(`data:image/png;base64,${png}`).length - 1,
        2,
        "both images are sent",
      )
      assert.ok(request.includes("What can I make with this?"))
      assert.equal(await browser.evaluate(`${attached}.length`), 0)
    }),
)
