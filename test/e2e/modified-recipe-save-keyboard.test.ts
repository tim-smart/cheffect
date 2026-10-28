import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"
import fixture from "../fixtures/openai-web-search-stream.json" with { type: "json" }

// The recipe page moves between method steps on Space, which must not swallow
// Space on the banner's Save button: a keyboard user saving the assistant's
// edits should get the edits saved, not a step change.

const envelope = (type: string) =>
  fixture.find((event) => event.type === type)!.response

// One response from the model: a SuggestRecipeEdit call that renames the
// recipe and replaces its method
const editCallStream = (recipeId: string, title: string) => {
  // Strict mode sends every field, with null for the ones left unchanged
  const args = JSON.stringify({
    recipeId,
    changes: {
      title,
      imageUrl: null,
      prepTime: null,
      cookingTime: null,
      servings: null,
      ingredients: [
        {
          name: "Flour",
          ingredients: [{ name: "flour", quantity: 1, unit: "cup" }],
        },
      ],
      steps: [
        { text: "Mix.", tips: [] },
        { text: "Cook.", tips: [] },
        { text: "Serve.", tips: [] },
      ],
      sourceName: null,
      clear: null,
    },
  })
  const item = {
    id: "fc_1",
    type: "function_call",
    call_id: "call_1",
    name: "SuggestRecipeEdit",
    arguments: args,
  }
  return [
    { type: "response.created", response: envelope("response.created") },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...item, arguments: "", status: "in_progress" },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 0,
      item_id: "fc_1",
      delta: args,
    },
    {
      type: "response.function_call_arguments.done",
      output_index: 0,
      item_id: "fc_1",
      arguments: args,
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: { ...item, status: "completed" },
    },
    {
      type: "response.completed",
      response: {
        ...envelope("response.completed"),
        output: [{ ...item, status: "completed" }],
      },
    },
  ]
}

// The follow-up response after the tool result: text, so the chat stops
const textStream = (text: string) => {
  const item = {
    id: "msg_1",
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", annotations: [], logprobs: [], text }],
  }
  return [
    { type: "response.created", response: envelope("response.created") },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...item, status: "in_progress", content: [] },
    },
    {
      type: "response.output_text.delta",
      item_id: "msg_1",
      output_index: 0,
      content_index: 0,
      delta: text,
      logprobs: [],
    },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: { ...envelope("response.completed"), output: [item] },
    },
  ]
}

const sse = (events: ReadonlyArray<{ type: string }>) =>
  events
    .map(
      (event, sequence_number) =>
        `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`,
    )
    .join("")

const chatInput = `document.querySelector('textarea[placeholder="Type your message..."]')`
const banner = `document.querySelector('[role="status"]')`
const saveButton = `[...${banner}.querySelectorAll("button")].find((b) => b.textContent === "Save")`
const currentStep = `document.querySelector('[aria-current="step"] p')?.textContent`

test(
  "Space on the banner's Save button saves the assistant's edits without changing the step",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.setViewport(1280, 900, { mobile: false })
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

      // The model suggests an edit, then wraps up once it hears the result
      const editedTitle = "Pancakes, edited by the test"
      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`!!document.querySelector("main h1")`)
      await browser.evaluate(`(() => {
        const responses = [${JSON.stringify(sse(editCallStream(recipeId, editedTitle)))}, ${JSON.stringify(sse(textStream("Done chef.")))}]
        const originalFetch = window.fetch
        window.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input)
          if (url.startsWith("https://api.openai.com/")) {
            return new Response(responses.shift() ?? responses.at(-1), { headers: { "content-type": "text/event-stream" } })
          }
          return originalFetch(input, init)
        }
      })()`)
      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.waitFor(`!!${chatInput}`)
      await browser.evaluate(`(() => {
        const input = ${chatInput}
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Rename this recipe")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      await browser.evaluate(
        `(${chatInput}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
      )
      await browser.waitFor(
        `!!${banner} && document.body.textContent.includes("Done chef.")`,
      )
      assert.equal(
        await browser.evaluate(`document.querySelector("main h1").textContent`),
        editedTitle,
        "the page shows the edit before saving",
      )
      assert.equal(await browser.evaluate(currentStep), "Mix.")

      // Save with the keyboard
      await browser.evaluate(`(${saveButton}).focus()`)
      await browser.press(" ", "Space", 32)
      await browser.waitFor(`!${banner}`)
      assert.equal(
        await browser.evaluate(currentStep),
        "Mix.",
        "the step did not change",
      )
      assert.equal(
        await browser.evaluate(`Math.round(scrollY)`),
        0,
        "the page did not scroll",
      )

      // The saved edit survives a reload
      await journalSettled(browser)
      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`!!document.querySelector("main h1")`)
      assert.equal(
        await browser.evaluate(`document.querySelector("main h1").textContent`),
        editedTitle,
      )
      assert.equal(await browser.evaluate(`!!${banner}`), false)
    }),
)
