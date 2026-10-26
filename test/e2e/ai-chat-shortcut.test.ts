import { test } from "node:test"
import * as assert from "node:assert/strict"
import { hasChromium, journalSettled, withSeededApp } from "./harness"

// Ctrl+J (⌘J on Apple keyboards) opens the chat from anywhere and closes it
// again, from the message field too, and focus goes back where it was. An
// open menu keeps the key. Chromium here runs on Linux, so Ctrl.

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`
const panel = `document.querySelector('[role="region"][aria-label="AI Sous-chef"]')`
const chatButton = `document.querySelector('[aria-label="Open AI Chat"]')`
const recipeOptions = `document.querySelector('[aria-label="Recipe options"]')`
// the `modifiers` bit for Ctrl
const ctrl = 2

test(
  "Ctrl+J toggles the AI chat and returns focus",
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
      await browser.waitFor(`!!${recipeOptions}`)
      assert.equal(
        await browser.evaluate(`(${chatButton}).title`),
        "AI Sous-chef (Ctrl+J)",
        "the chat button names its shortcut",
      )
      const toggle = () => browser.press("j", "KeyJ", 74, ctrl)

      // nothing had focus, so closing leaves it on the chat button
      await toggle()
      await browser.waitFor(
        `(${panel}).checkVisibility() && document.activeElement === ${input}`,
      )
      await toggle()
      await browser.waitFor(
        `!(${panel}).checkVisibility() && document.activeElement === ${chatButton}`,
      )
      assert.equal(
        await browser.evaluate(`(${input}).value`),
        "",
        "no j was typed",
      )

      // closing returns focus to the control that had it
      await browser.evaluate(`(${recipeOptions}).focus()`)
      await toggle()
      await browser.waitFor(
        `(${panel}).checkVisibility() && document.activeElement === ${input}`,
      )
      await toggle()
      await browser.waitFor(
        `!(${panel}).checkVisibility() && document.activeElement === ${recipeOptions}`,
      )

      // an open menu holds focus, so it keeps the key
      await browser.press("Enter", "Enter", 13)
      await browser.waitFor(`!!document.activeElement.closest('[role="menu"]')`)
      await toggle()
      await browser.evaluate(
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      )
      assert.equal(
        await browser.evaluate(`(${panel}).checkVisibility()`),
        false,
      )
      assert.equal(
        await browser.evaluate(
          `!!document.activeElement.closest('[role="menu"]')`,
        ),
        true,
        "the menu keeps focus",
      )
      await browser.press("Escape", "Escape", 27)
      await browser.waitFor(`!document.querySelector('[role="menu"]')`)
      await toggle()
      await browser.waitFor(`(${panel}).checkVisibility()`)
    }),
)
