import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  type Browser,
  hasChromium,
  journalSettled,
  sleep,
  withSeededApp,
} from "./harness"

// Ctrl+K (⌘K on Apple keyboards) opens a recipe search over any screen.
// Escape closes it and leaves the page as it was, its state and focus
// included; only picking a result navigates. Picking one from inside the
// chat, which covers a phone's screen, minimizes the chat so the recipe
// shows, and keeps the chat's draft for later.

const dialog = `document.querySelector('[role="dialog"]')`
const dialogInput = `${dialog}?.querySelector("input")`
const pageSearch = `document.querySelector('main input[placeholder="Search recipes..."]')`
const chat = `document.querySelector('[aria-label="AI Sous-chef"]')`
const chatInput = `document.querySelector('textarea[placeholder="Type your message..."]')`
const ctrl = 2
const meta = 4

const keyboards = [
  {
    name: "Ctrl+K",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    modifier: ctrl,
    other: meta,
  },
  {
    name: "⌘K on a Mac",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    modifier: meta,
    other: ctrl,
  },
]

const type = (browser: Browser, input: string, value: string) =>
  browser.evaluate(`(() => {
    const input = ${input}
    Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })()`)

for (const keyboard of keyboards) {
  test(
    `${keyboard.name} searches recipes in a dialog: Escape keeps the page, Enter opens the recipe`,
    { skip: !hasChromium && "chromium not found", timeout: 180_000 },
    () =>
      withSeededApp(
        async ({ browser, base, recipeId }) => {
          const shortcut = () =>
            browser.press("k", "KeyK", 75, keyboard.modifier)
          const title = await browser.evaluate<string>(
            `document.querySelector('a[href="/recipes/${recipeId}"] h3').textContent`,
          )

          // The chat needs an API key
          await browser.navigate(`${base}/settings`)
          await browser.waitFor(`!!document.querySelector("#openAiApiKey")`)
          await type(
            browser,
            `document.querySelector("#openAiApiKey")`,
            "test-api-key",
          )
          await browser.evaluate(
            `document.querySelector("#openAiApiKey").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
          )
          await journalSettled(browser)
          await browser.setViewport(1280, 900, { mobile: false })
          await browser.navigate(`${base}/`)
          await browser.waitFor(`!!${pageSearch}`)

          // A query typed into the recipes page, with the field still focused
          await browser.evaluate(`${pageSearch}.focus()`)
          await type(browser, pageSearch, "zz")
          await browser.waitFor(
            `document.body.textContent.includes("No recipes found")`,
          )

          // The other platform's modifier does nothing
          await browser.press("k", "KeyK", 75, keyboard.other)
          await sleep(300)
          assert.equal(await browser.evaluate(`!!${dialog}`), false)

          await shortcut()
          await browser.waitFor(`document.activeElement === ${dialogInput}`)
          await type(browser, dialogInput, title)
          await browser.waitFor(
            `${dialog}.querySelector('[cmdk-item]')?.textContent.includes(${JSON.stringify(title)})`,
          )
          await browser.press("Escape", "Escape", 27)
          await browser.waitFor(
            `!${dialog} && document.activeElement === ${pageSearch}`,
          )
          assert.equal(await browser.evaluate(`location.pathname`), "/")
          assert.equal(await browser.evaluate(`${pageSearch}.value`), "zz")

          // From another screen, the shortcut opens an empty search, and the
          // page only changes once a result is picked
          await browser.click(
            `document.querySelector('nav[aria-label="Primary"] a[href="/groceries"]')`,
          )
          await browser.waitFor(`location.pathname === "/groceries"`)
          await shortcut()
          await browser.waitFor(`document.activeElement === ${dialogInput}`)
          assert.equal(await browser.evaluate(`${dialogInput}.value`), "")
          await type(browser, dialogInput, title)
          await browser.waitFor(
            `${dialog}.querySelector('[cmdk-item][data-selected="true"]')?.textContent.includes(${JSON.stringify(title)})`,
          )
          assert.equal(
            await browser.evaluate(`location.pathname`),
            "/groceries",
          )
          await browser.press("Enter", "Enter", 13)
          await browser.waitFor(
            `location.pathname === "/recipes/${recipeId}" && !${dialog}`,
          )
          await browser.waitFor(
            `document.querySelector("main h1")?.textContent === ${JSON.stringify(title)}`,
          )

          // On a phone the chat covers the screen. A recipe picked from it
          // shows, with the chat minimized and its draft kept
          await browser.setViewport(390, 844)
          await browser.click(
            `document.querySelector('nav:not([aria-label]) a[href="/groceries"]')`,
          )
          await browser.waitFor(`location.pathname === "/groceries"`)
          await browser.click(
            `document.querySelector('[aria-label="Open AI Chat"]')`,
          )
          await browser.waitFor(`document.activeElement === ${chatInput}`)
          await type(browser, chatInput, "A draft to keep")
          await shortcut()
          await browser.waitFor(`document.activeElement === ${dialogInput}`)
          await type(browser, dialogInput, title)
          await browser.waitFor(
            `${dialog}.querySelector('[cmdk-item][data-selected="true"]')?.textContent.includes(${JSON.stringify(title)})`,
          )
          await browser.press("Enter", "Enter", 13)
          await browser.waitFor(
            `location.pathname === "/recipes/${recipeId}" && !${dialog}`,
          )
          await browser.waitFor(`(() => {
            const h1 = document.querySelector("main h1")
            if (h1?.textContent !== ${JSON.stringify(title)}) return false
            const rect = h1.getBoundingClientRect()
            return h1.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
          })()`)
          assert.equal(
            await browser.evaluate(`${chat}.getClientRects().length`),
            0,
            "the chat is minimized",
          )
          // Minimizing the chat leaves the history alone: the recipe stays
          await sleep(500)
          assert.equal(
            await browser.evaluate(`location.pathname`),
            `/recipes/${recipeId}`,
          )
          await browser.click(
            `document.querySelector('[aria-label="Open AI Chat"]')`,
          )
          await browser.waitFor(`${chat}.getClientRects().length > 0`)
          assert.equal(
            await browser.evaluate(`${chatInput}.value`),
            "A draft to keep",
          )
        },
        {
          init: `Object.defineProperty(Navigator.prototype, "userAgent", { get: () => ${JSON.stringify(keyboard.userAgent)} })`,
        },
      ),
  )
}

// A longer query starts its results at the top, even when the list was
// scrolled and the first result stays the same. The padding recipes are
// "Recipe 0001" onwards, so "Recipe 0" and "Recipe 000" both lead with 0001
test(
  "a query typed after scrolling the results shows them from the top",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(
      async ({ browser }) => {
        const list = `${dialog}.querySelector("[cmdk-list]")`
        const first = `${dialog}.querySelector("[cmdk-item]")`
        await browser.setViewport(1280, 900, { mobile: false })
        await browser.press("k", "KeyK", 75, ctrl)
        await browser.waitFor(`document.activeElement === ${dialogInput}`)
        await type(browser, dialogInput, "Recipe 0")
        await browser.waitFor(
          `${first}?.textContent.includes("Recipe 0001") && ${list}.scrollHeight > ${list}.clientHeight`,
        )
        await browser.evaluate(`${list}.scrollTop = ${list}.scrollHeight`)
        await browser.waitFor(`${list}.scrollTop > 0`)

        await type(browser, dialogInput, "Recipe 000")
        await browser.waitFor(
          `${dialog}.querySelectorAll("[cmdk-item]").length === 9`,
        )
        await sleep(300)
        assert.equal(await browser.evaluate(`${list}.scrollTop`), 0)
        assert.equal(
          await browser.evaluate(
            `${first}.getAttribute("data-selected") === "true"`,
          ),
          true,
          "the first result is the selected one",
        )
      },
      {
        init: `Object.defineProperty(Navigator.prototype, "userAgent", { get: () => "Mozilla/5.0 (X11; Linux x86_64)" }); localStorage.setItem("cheffect:devSeedPadding", "80")`,
      },
    ),
)
