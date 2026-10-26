import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// Ctrl+J (⌘J on Apple keyboards) opens the chat from anywhere and closes it
// again, from the message field too. Chromium here runs on Linux, so Ctrl.

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`
const panel = `document.querySelector('[role="region"][aria-label="AI Sous-chef"]')`
// the `modifiers` bit for Ctrl
const ctrl = 2

test(
  "Ctrl+J toggles the AI chat",
  { skip: !hasChromium && "chromium not found", timeout: 120_000 },
  async () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.setViewport(1280, 800, { mobile: false })
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
      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(`!!document.querySelector("main h1")`)
      assert.equal(
        await browser.evaluate(
          `document.querySelector('[aria-label="Open AI Chat"]').title`,
        ),
        "AI Sous-chef (Ctrl+J)",
        "the chat button names its shortcut",
      )

      await browser.press("j", "KeyJ", 74, ctrl)
      await browser.waitFor(
        `(${panel}).checkVisibility() && document.activeElement === ${input}`,
      )

      // the message field has focus, and the shortcut still closes the chat
      await browser.press("j", "KeyJ", 74, ctrl)
      await browser.waitFor(`!(${panel}).checkVisibility()`)
      assert.equal(
        await browser.evaluate(`(${input}).value`),
        "",
        "no j was typed",
      )

      await browser.press("j", "KeyJ", 74, ctrl)
      await browser.waitFor(`(${panel}).checkVisibility()`)
    }),
)
