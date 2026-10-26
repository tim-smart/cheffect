import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  type Browser,
  hasChromium,
  journalSettled,
  withSeededApp,
} from "./harness"
import fixture from "../fixtures/openai-web-search-stream.json" with { type: "json" }

// Tool calls the assistant makes show as rows in the chat. A row's state
// follows the call itself, and a finished call links to what it touched.
// A reply shows as it streams in, before its text has ended.

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`
const submit = `(${input}).closest("form").querySelector('button[type="submit"]')`
const rows = `[...document.querySelectorAll('[role="log"] button[aria-expanded]')].map((row) => row.textContent.trim())`

const sse = (event: object) =>
  `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`
const envelope = fixture[fixture.length - 1] as {
  readonly response: Record<string, unknown>
}
const opening = [sse(fixture[0]), sse(fixture[1])]
const completed = sse({
  ...envelope,
  response: { ...envelope.response, output: [] },
})
const functionCall = (name: string, args: object) => {
  const item = {
    id: `fc_${name}`,
    type: "function_call",
    call_id: `call_${name}`,
    name,
    arguments: "",
  }
  return [
    sse({ type: "response.output_item.added", output_index: 0, item }),
    sse({
      type: "response.function_call_arguments.done",
      item_id: item.id,
      output_index: 0,
      arguments: JSON.stringify(args),
    }),
  ].join("")
}
const messageItem = {
  id: "msg_1",
  type: "message",
  status: "completed",
  role: "assistant",
  content: [],
}
// The start of a text reply, without its end
const textDelta = (text: string) =>
  [
    sse({
      type: "response.output_item.added",
      output_index: 0,
      item: messageItem,
    }),
    sse({
      type: "response.output_text.delta",
      item_id: messageItem.id,
      output_index: 0,
      content_index: 0,
      delta: text,
    }),
  ].join("")
const textMessage = (text: string) =>
  [
    textDelta(text),
    sse({
      type: "response.output_item.done",
      output_index: 0,
      item: {
        ...messageItem,
        content: [{ type: "output_text", annotations: [], text }],
      },
    }),
    completed,
  ].join("")

// Each OpenAI request takes the next response: a list of SSE chunks, with a
// number for a pause in milliseconds and "stall" for a stream that never ends.
const withChat = async (
  browser: Browser,
  base: string,
  responses: ReadonlyArray<ReadonlyArray<string | number>>,
) => {
  await browser.navigate(`${base}/settings`)
  await browser.waitFor(`!!document.querySelector("#openAiApiKey")`)
  await browser.evaluate(`(() => {
    const input = document.querySelector("#openAiApiKey")
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "test-api-key")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  })()`)
  await journalSettled(browser)
  await browser.evaluate(`(() => {
    const responses = ${JSON.stringify(responses)}
    const originalFetch = window.fetch
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.startsWith("https://api.openai.com/")) return originalFetch(input, init)
      const chunks = responses.shift() ?? []
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            if (chunk === "stall") return
            if (typeof chunk === "number") await new Promise((r) => setTimeout(r, chunk))
            else controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        },
      })
      return new Response(body, { headers: { "content-type": "text/event-stream" } })
    }
  })()`)
  await browser.click(`document.querySelector('[aria-label="Open AI Chat"]')`)
  await browser.waitFor(`!!${input}`)
}

const send = (browser: Browser, text: string) =>
  browser.evaluate(`(() => {
    const input = ${input}
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, ${JSON.stringify(text)})
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  })()`)

test(
  "a reply shows while its text is still streaming",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async () =>
    withSeededApp(async ({ browser, base }) => {
      await withChat(browser, base, [
        [...opening, textDelta("Pumpkins are"), "stall"],
      ])
      await send(browser, "What is in season?")
      // the stop button shows while the reply is still coming
      await browser.waitFor(
        `document.body.textContent.includes("Pumpkins are") && !(${submit}).disabled`,
      )
    }),
)

test(
  "a tool call stopped with the reply stays stopped after the next message",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async () =>
    withSeededApp(async ({ browser, base }) => {
      await withChat(browser, base, [
        [
          ...opening,
          functionCall("GetMenuEntries", { menuId: "menu" }),
          "stall",
        ],
        [...opening, 1500, textMessage("Hello to you too.")],
      ])
      await send(browser, "Plan dinner from my menu")
      await browser.waitFor(
        `document.body.textContent.includes("Reading a menu…")`,
      )
      await browser.click(submit)
      await browser.waitFor(
        `document.body.textContent.includes("Stopped reading a menu")`,
      )
      // the next message builds on the saved turn
      await journalSettled(browser)

      await send(browser, "Hello again")
      // while the reply is still coming, the stop button shows
      await browser.waitFor(
        `document.body.textContent.includes("Hello again") && !(${submit}).disabled`,
      )
      assert.deepEqual(await browser.evaluate(rows), ["Stopped reading a menu"])
      await browser.waitFor(
        `document.body.textContent.includes("Hello to you too.") && (${submit}).disabled`,
      )
      assert.deepEqual(await browser.evaluate(rows), ["Stopped reading a menu"])
    }),
)

test(
  "Open on items added to a named grocery list shows that list",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  async () =>
    withSeededApp(async ({ browser, base }) => {
      await withChat(browser, base, [
        [
          ...opening,
          functionCall("AddGroceryItems", {
            groceryItems: [
              {
                list: "Party",
                name: "Tomatoes",
                quantity: "4",
                aisle: "Produce",
                recipeIds: null,
              },
            ],
          }),
          completed,
        ],
        [...opening, textMessage("Tomatoes are on the Party list.")],
      ])
      await send(browser, "Add tomatoes to the party list")
      await browser.waitFor(
        `document.body.textContent.includes("Tomatoes are on the Party list.") && (${submit}).disabled`,
      )
      assert.deepEqual(await browser.evaluate(rows), [
        "Added 1 item to the “Party” list",
      ])

      await browser.click(
        `document.querySelector('[role="log"] a[href="/groceries?list=Party"]')`,
      )
      await browser.waitFor(`location.pathname === "/groceries"`)
      await browser.waitFor(
        `[...document.querySelectorAll("h1")].some((h) => h.textContent.includes("Party"))`,
      )
      await browser.waitFor(`document.body.textContent.includes("Tomatoes")`)
    }),
)
