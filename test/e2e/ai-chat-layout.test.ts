import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, sleep, withSeededApp } from "./harness"

// The AI chat panel's size on phones and desktops.
//
// iOS doesn't shrink the page for the keyboard: it shrinks the visual
// viewport and pans it down the page, and iOS 26 can shrink innerHeight too.
// Chromium has no on-screen keyboard, so a stand-in visual viewport replays
// the geometry the iOS 26.3 simulator logged on an iPhone 17 Pro.

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`
const panel = `(${input}).closest(".fixed")`
const maximize = `document.querySelector('button[aria-label="Maximize chat"]')`
const restore = `document.querySelector('button[aria-label="Restore chat size"]')`
const hideKeyboard = `document.querySelector('button[aria-label="Hide keyboard"]')`

// `__keyboard(height, offsetTop, innerHeight?)` raises a keyboard of that
// height with the visual viewport panned `offsetTop` down the page, and
// resolves once the page has rendered. The keyboard lowers, as on iOS, when
// the message field loses focus.
//
// `__virtualKeyboard(height, innerHeight?)` stands in for Chromium's
// VirtualKeyboard API: it reports a keyboard of that height at the bottom of
// the page, but only once the page has asked the keyboard to overlay it, with
// the page `innerHeight` tall while it's up.
const keyboardStandIn = `(() => {
  const layoutHeight = Object.getOwnPropertyDescriptor(window, "innerHeight").get.bind(window)
  let keyboard = 0
  let offsetTop = 0
  let innerHeightOverride
  const viewport = new EventTarget()
  Object.defineProperties(viewport, {
    width: { get: () => innerWidth },
    height: { get: () => layoutHeight() - keyboard },
    offsetTop: { get: () => offsetTop },
    offsetLeft: { get: () => 0 },
    pageTop: { get: () => scrollY + offsetTop },
    pageLeft: { get: () => scrollX },
    scale: { get: () => 1 },
  })
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => innerHeightOverride ?? layoutHeight(),
  })
  window.__keyboard = (height, top, innerHeight) => {
    keyboard = height
    offsetTop = top
    innerHeightOverride = innerHeight
    viewport.dispatchEvent(new Event("resize"))
    viewport.dispatchEvent(new Event("scroll"))
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }
  let virtualKeyboardHeight = 0
  let overlaysContent = false
  const virtualKeyboard = new EventTarget()
  Object.defineProperties(virtualKeyboard, {
    overlaysContent: { get: () => overlaysContent, set: (value) => { overlaysContent = value } },
    boundingRect: {
      get: () => {
        const height = overlaysContent ? virtualKeyboardHeight : 0
        return new DOMRect(0, innerHeight - height, innerWidth, height)
      },
    },
  })
  Object.defineProperty(navigator, "virtualKeyboard", { configurable: true, get: () => virtualKeyboard })
  window.__virtualKeyboard = (height, innerHeight) => {
    virtualKeyboardHeight = height
    innerHeightOverride = innerHeight
    virtualKeyboard.dispatchEvent(new Event("geometrychange"))
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }
  setInterval(() => {
    if (keyboard > 0 && !(document.activeElement instanceof HTMLTextAreaElement)) {
      window.__keyboard(0, 0)
    }
  }, 50)
})()`

const rectOf = (browser: Browser, element: string) =>
  browser.evaluate<{
    top: number
    bottom: number
    left: number
    right: number
  }>(
    `(() => {
      const { top, bottom, left, right } = (${element}).getBoundingClientRect()
      return { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(left), right: Math.round(right) }
    })()`,
  )

/**
 * Asserts the chat covers the visible `top`-`bottom`, less a small gap at
 * the top, with the message field inside.
 */
const assertFits = async (
  browser: Browser,
  what: string,
  top: number,
  bottom: number,
) => {
  const chat = await rectOf(browser, panel)
  assert.ok(
    chat.top >= top && chat.top <= top + 16 && chat.bottom === bottom,
    `${what}: the chat is at ${chat.top}-${chat.bottom}px, not ${top}-${bottom}px`,
  )
  const field = await rectOf(browser, input)
  assert.ok(
    field.top >= chat.top && field.bottom <= bottom,
    `${what}: the message field is at ${field.top}-${field.bottom}px`,
  )
}

const openChatOnSettings = async (browser: Browser, base: string) => {
  await browser.navigate(`${base}/settings`)
  await browser.waitFor(`!!document.querySelector("#openAiApiKey")`)
  await browser.evaluate(`(() => {
    const input = document.querySelector("#openAiApiKey")
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "test-api-key")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })()`)
  // A separate call lets React render before committing the field.
  await browser.evaluate(
    `document.querySelector("#openAiApiKey").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`,
  )
  // until the key is saved, the chat button opens the settings instead
  await browser.waitFor(
    `(document.querySelector('[aria-label="Open AI Chat"]').click(), (${panel}).checkVisibility())`,
  )
  await browser.click(input)
}

test(
  "on a phone the chat covers what the keyboard leaves visible",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      await browser.setViewport(390, 844)
      await browser.addInitScript(keyboardStandIn)
      await openChatOnSettings(browser, base)

      await assertFits(browser, "keyboard down", 0, 844)
      assert.equal(
        await browser.evaluate(`!!(${maximize})?.checkVisibility()`),
        false,
        "a phone has a maximize button",
      )

      // [what, screen, keyboard, offsetTop, innerHeight]
      const cases: ReadonlyArray<
        readonly [string, [number, number], number, number, number?]
      > = [
        ["keyboard up, not panned", [390, 844], 336, 0],
        // iOS 26 shrinks innerHeight to match the visual viewport
        ["Safari first open", [402, 714], 337, 337, 377],
        // as wide as a desktop window, but too short for the desktop panel
        ["landscape phone", [844, 390], 180, 0],
        ["PWA landscape, 126px", [874, 402], 276, 69],
        ["Safari landscape, 98px", [874, 402], 304, 233],
      ]
      for (const [what, [width, height], keyboard, offsetTop, inner] of cases) {
        await browser.setViewport(width, height)
        await browser.evaluate(
          `window.__keyboard(${keyboard}, ${offsetTop}, ${inner})`,
        )
        await assertFits(
          browser,
          what,
          offsetTop,
          offsetTop + height - keyboard,
        )
      }

      // Chrome 155 on an Android phone, from its event trace: the page is
      // 801px tall under the gesture bar. The first keyboard moved it above
      // the bar to 777px, with a 378px keyboard from 399px. After a dismissal
      // the page was 801px again, and the next keyboard left it there,
      // reported 378px from 423px, while Gboard was drawn from 399px.
      await browser.setViewport(411, 801)
      await browser.evaluate(`window.__keyboard(0, 0)`)
      await browser.evaluate(`window.__virtualKeyboard(0)`)
      await browser.evaluate(`window.__virtualKeyboard(378, 777)`)
      await assertFits(browser, "Android Chrome, first keyboard", 0, 399)
      await browser.evaluate(`window.__virtualKeyboard(0)`)
      await browser.evaluate(`window.__virtualKeyboard(378)`)
      await assertFits(browser, "Android Chrome, next keyboard", 0, 399)

      // closing the chat gives other fields the usual keyboard back
      await browser.evaluate(`window.__virtualKeyboard(0)`)
      await browser.click(
        `document.querySelector('button[aria-label="Close chat"]')`,
      )
      assert.equal(
        await browser.evaluate(`navigator.virtualKeyboard.overlaysContent`),
        false,
        "the keyboard still overlays the page after closing the chat",
      )
    }),
)

test(
  "in Safari landscape the chat recovers when the keyboard leaves no room, and keeps the draft",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base }) => {
      // Safari with its toolbars showing
      await browser.setViewport(874, 296)
      await browser.addInitScript(keyboardStandIn)
      await openChatOnSettings(browser, base)
      await browser.evaluate(`(() => {
        const input = ${input}
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Local draft")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)

      // The keyboard covered the whole page: a -4px visual viewport. The
      // chat can't be seen, so it lowers the keyboard.
      await browser.evaluate(`window.__keyboard(300, 300)`)
      await browser.waitFor(
        `document.activeElement !== (${input}) && visualViewport.height === 296`,
        3000,
      )
      await assertFits(browser, "after collapsing", 0, 296)

      // Tapping the field again left a 19px strip. The chat keeps the
      // keyboard, fits the field and a way to hide the keyboard in it.
      await browser.click(input)
      await browser.evaluate(`window.__keyboard(277, 245, 51)`)
      assert.equal(
        await browser.evaluate(`document.activeElement === (${input})`),
        true,
        "the chat took the keyboard away from the user's tap",
      )
      await assertFits(browser, "in a 19px strip", 245, 264)
      const button = await rectOf(browser, hideKeyboard)
      assert.ok(
        button.top >= 245 && button.bottom <= 264,
        `the hide keyboard button is at ${button.top}-${button.bottom}px`,
      )

      await browser.click(hideKeyboard)
      await browser.waitFor(`visualViewport.height === 296`, 3000)
      await assertFits(browser, "after hiding the keyboard", 0, 296)
      assert.equal(
        await browser.evaluate(
          `document.querySelector("h2").checkVisibility()`,
        ),
        true,
        "the header is still hidden",
      )
      assert.equal(
        await browser.evaluate(`(${input}).value`),
        "Local draft",
        "the draft was lost",
      )
    }),
)

test(
  "on a desktop the chat leaves the page visible and where it was scrolled, and can be maximized",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.setViewport(1280, 800, { mobile: false })
      await openChatOnSettings(browser, base)

      // the old default was 480 x 600
      const initial = await rectOf(browser, panel)
      const width = initial.right - initial.left
      const height = initial.bottom - initial.top
      assert.ok(
        width < 480 && height < 600 && width >= 320 && height >= 400,
        `the chat is ${width} x ${height}`,
      )

      await browser.click(maximize)
      await browser.waitFor(`!!(${restore})`)
      const maximized = await rectOf(browser, panel)
      assert.ok(
        maximized.right - maximized.left >= 1280 * 0.75 &&
          maximized.bottom - maximized.top >= 800 * 0.8 &&
          maximized.top >= 0 &&
          maximized.left >= 0 &&
          maximized.right <= 1280 &&
          maximized.bottom <= 800,
        `the maximized chat is at ${JSON.stringify(maximized)}`,
      )

      await browser.click(restore)
      await browser.waitFor(`!!(${maximize})`)
      assert.deepEqual(
        await rectOf(browser, panel),
        initial,
        "restoring doesn't return the chat to its default size",
      )

      await browser.setViewport(1280, 600, { mobile: false })
      await browser.navigate(`${base}/recipes/${recipeId}`)
      await browser.waitFor(
        `document.documentElement.scrollHeight > innerHeight + 100`,
      )
      const scrolled = await browser.evaluate<number>(
        `(scrollTo(0, document.documentElement.scrollHeight), Math.round(scrollY))`,
      )
      assert.ok(scrolled > 100, `the recipe only scrolled ${scrolled}px`)

      await browser.click(
        `document.querySelector('[aria-label="Open AI Chat"]')`,
      )
      await browser.waitFor(`(${panel}).checkVisibility()`)
      // let the router settle the chat's history entry
      await sleep(500)
      assert.equal(
        await browser.evaluate(`Math.round(scrollY)`),
        scrolled,
        "opening the chat scrolled the page",
      )

      // the page beside the panel still scrolls
      assert.equal(
        await browser.evaluate(`(scrollBy(0, -50), Math.round(scrollY))`),
        scrolled - 50,
        "the page can't be scrolled with the chat open",
      )

      await browser.click(
        `document.querySelector('button[aria-label="Close chat"]')`,
      )
      await browser.waitFor(`!(${panel}).checkVisibility()`)
      await sleep(500)
      assert.equal(
        await browser.evaluate(`Math.round(scrollY)`),
        scrolled - 50,
        "closing the chat moved the page",
      )
    }),
)
