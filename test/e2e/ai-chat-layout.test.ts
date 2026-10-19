import { test } from "node:test"
import * as assert from "node:assert/strict"
import { type Browser, hasChromium, sleep, withSeededApp } from "./harness"

// The AI chat panel's size and scrolling.
//
// On a phone the panel is a sheet over the whole screen. It must stay put
// while the user scrolls in it, so the page behind it must not scroll. With
// the keyboard up it must fit the part of the screen the keyboard leaves.
//
// iOS doesn't shrink the page for the keyboard: it shrinks the visual
// viewport and may pan it down the page. Chromium has no on-screen keyboard,
// so a stand-in visual viewport plays the keyboard's part, the way iOS
// reports it.
//
// On a desktop the panel sits in the corner, small enough to leave the
// recipe readable, and a maximize button makes it fill most of the window.

const input = `document.querySelector('textarea[placeholder="Type your message..."]')`
const panel = `(${input}).closest(".fixed")`
const maximize = `document.querySelector('button[aria-label="Maximize chat"]')`
const restore = `document.querySelector('button[aria-label="Restore chat size"]')`

type Rect = {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}
const rectOf = (browser: Browser, element: string) =>
  browser.evaluate<Rect>(`(() => {
    const { top, bottom, left, right } = (${element}).getBoundingClientRect()
    return { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(left), right: Math.round(right) }
  })()`)

// Replaces window.visualViewport. `__keyboard(height, offsetTop)` raises a
// keyboard of that height with the visual viewport panned `offsetTop` down
// the page; `__keyboard(0, 0)` lowers it.
//
// iOS 26 can also shrink innerHeight while the keyboard is up:
// `__keyboard(height, offsetTop, true)` shrinks it to the visual viewport's
// height, and `__keyboard(height, offsetTop, innerHeight)` sets it.
//
// `__keyboardFollowsFocus()` lowers the keyboard, as iOS does, whenever the
// message field loses focus.
//
// `__keyboardOnOpen(height, offsetTop)` raises the keyboard when the chat is
// next opened, which focuses the message field, in the order the iOS 26.3
// simulator logged on first open: the keyboard rises, then the view pans
// and innerHeight drops to the visual viewport's height.
const keyboardStandIn = `(() => {
  const layoutHeight = Object.getOwnPropertyDescriptor(window, "innerHeight").get.bind(window)
  let keyboard = 0
  let offsetTop = 0
  let layout = false
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
    get: () =>
      typeof layout === "number" ? layout : layoutHeight() - (layout ? keyboard : 0),
  })
  window.__keyboard = (height, top, innerHeight = false) => {
    keyboard = height
    offsetTop = top
    layout = innerHeight
    viewport.dispatchEvent(new Event("resize"))
    viewport.dispatchEvent(new Event("scroll"))
  }
  window.__keyboardFollowsFocus = () => {
    setInterval(() => {
      if (keyboard === 0 || document.activeElement instanceof HTMLTextAreaElement) return
      window.__keyboard(0, 0)
    }, 50)
  }
  window.__keyboardOnOpen = (height, top) => {
    document.addEventListener("click", (event) => {
      if (!event.target.closest('[aria-label="Open AI Chat"]')) return
      setTimeout(() => {
        keyboard = height
        viewport.dispatchEvent(new Event("resize"))
      }, 100)
      setTimeout(() => {
        offsetTop = top
        layout = true
        dispatchEvent(new Event("resize"))
        viewport.dispatchEvent(new Event("scroll"))
      }, 150)
    }, { capture: true, once: true })
  }
})()`

const enableAi = async (browser: Browser, base: string) => {
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
  await sleep(2000)
}

const openRecipe = async (browser: Browser, base: string, recipeId: string) => {
  await browser.navigate(`${base}/recipes/${recipeId}`)
  await browser.waitFor(`!!document.querySelector(".pb-content")`)
}

const openChat = async (browser: Browser) => {
  await browser.click(`document.querySelector('[aria-label="Open AI Chat"]')`)
  await browser.waitFor(`!!(${input}) && (${panel}).checkVisibility()`)
  // wait for the panel to stop moving
  await browser.click(input)
}

test(
  "on a phone the chat fills the screen and the page behind it doesn't scroll",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.setViewport(390, 664)
      await enableAi(browser, base)
      await openRecipe(browser, base, recipeId)
      assert.ok(
        await browser.evaluate<boolean>(
          `document.documentElement.scrollHeight > innerHeight + 200`,
        ),
        "the recipe page scrolls",
      )
      await openChat(browser)

      const opened = await rectOf(browser, panel)
      assert.ok(
        opened.top <= 16,
        `the chat starts ${opened.top}px down, leaving the top of the screen unused`,
      )
      assert.deepEqual(
        { bottom: opened.bottom, left: opened.left, right: opened.right },
        { bottom: 664, left: 0, right: 390 },
        "the chat reaches the bottom and both sides of the screen",
      )
      assert.equal(
        await browser.evaluate(`!!(${maximize})?.checkVisibility()`),
        false,
        "a phone has no maximize button",
      )

      // scroll over the messages, then over the header
      await browser.wheel(`(${panel}).querySelector(".overflow-y-auto")`, 600)
      await browser.wheel(`(${panel}).querySelector("h2")`, 600)
      await sleep(500)
      assert.equal(
        await browser.evaluate(`Math.round(scrollY)`),
        0,
        "the page behind the chat scrolled",
      )
      assert.deepEqual(await rectOf(browser, panel), opened, "the chat moved")
    }),
)

test(
  "on a phone the chat fits the space above the keyboard, wherever iOS pans to and in landscape",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      // the screen Safari reported on an iPhone 17 Pro, iOS 26.3
      await browser.setViewport(402, 714)
      await enableAi(browser, base)
      await browser.addInitScript(keyboardStandIn)
      await openRecipe(browser, base, recipeId)

      // opening the chat raises the keyboard and pans the view all the way,
      // leaving innerHeight and the visual viewport both 377px tall
      await browser.evaluate(`window.__keyboardOnOpen(337, 337)`)
      await openChat(browser)
      await sleep(1000)
      const firstOpen = await rectOf(browser, panel)
      assert.deepEqual(
        { top: firstOpen.top, bottom: firstOpen.bottom },
        { top: 337, bottom: 714 },
        "on first open, the chat covers what's visible before the user scrolls",
      )

      await browser.setViewport(390, 844)
      const visible = (keyboard: number, offsetTop: number) => ({
        top: offsetTop,
        bottom: offsetTop + 844 - keyboard,
      })
      for (const offsetTop of [0, 200]) {
        await browser.evaluate(`window.__keyboard(336, ${offsetTop})`)
        await sleep(500)
        const { top, bottom } = await rectOf(browser, panel)
        assert.deepEqual(
          { top, bottom },
          visible(336, offsetTop),
          `with the visual viewport panned ${offsetTop}px, the chat covers what's visible`,
        )
        const field = await rectOf(browser, input)
        assert.ok(
          field.bottom <= visible(336, offsetTop).bottom,
          `the message field is under the keyboard (offsetTop ${offsetTop})`,
        )
      }

      // lowering the keyboard gives the screen back
      await browser.evaluate(`window.__keyboard(0, 0)`)
      await sleep(500)
      const closed = await rectOf(browser, panel)
      assert.ok(
        closed.top <= 16 && closed.bottom === 844,
        `after the keyboard closes the chat spans ${closed.top}-${closed.bottom}px`,
      )

      // a landscape phone is as wide as a small desktop window, but its
      // keyboard covers even more of the screen
      await browser.setViewport(844, 390)
      await browser.evaluate(`window.__keyboard(180, 0)`)
      await sleep(500)
      const landscape = await rectOf(browser, panel)
      assert.deepEqual(
        { top: landscape.top, bottom: landscape.bottom },
        { top: 0, bottom: 210 },
        "in landscape, the chat covers what's visible",
      )
      const field = await rectOf(browser, input)
      assert.ok(
        field.bottom <= 210,
        `in landscape, the message field is under the keyboard at ${field.top}-${field.bottom}px`,
      )

      // the installed app in landscape left the chat only 126px, panned 69px
      await browser.setViewport(874, 402)
      await browser.evaluate(`window.__keyboard(276, 69)`)
      await sleep(500)
      const short = await rectOf(browser, panel)
      assert.deepEqual(
        { top: short.top, bottom: short.bottom },
        { top: 69, bottom: 195 },
        "in a 126px landscape space, the chat covers what's visible",
      )
      const shortField = await rectOf(browser, input)
      assert.ok(
        shortField.bottom <= short.bottom,
        `in a 126px landscape space, the message field runs ${shortField.bottom - short.bottom}px past the chat`,
      )
    }),
)

test(
  "in Safari landscape the message field stays usable when the keyboard leaves little or no room",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      // Safari's landscape screen on an iPhone 17 Pro, iOS 26.3
      await browser.setViewport(874, 402)
      await enableAi(browser, base)
      await browser.addInitScript(keyboardStandIn)
      await openRecipe(browser, base, recipeId)
      await openChat(browser)
      await browser.evaluate(`window.__keyboardFollowsFocus()`)

      // the keyboard left 98px, panned 233px down the page
      await browser.evaluate(`window.__keyboard(304, 233)`)
      await sleep(500)
      const short = await rectOf(browser, panel)
      assert.deepEqual(
        { top: short.top, bottom: short.bottom },
        { top: 233, bottom: 331 },
        "in a 98px landscape space, the chat covers what's visible",
      )
      const shortField = await rectOf(browser, input)
      assert.ok(
        shortField.bottom <= short.bottom,
        `in a 98px landscape space, the message field runs ${shortField.bottom - short.bottom}px past the chat`,
      )

      // With Safari's tab bar showing, the keyboard covered the whole page
      // and the visual viewport reported -4px. Nothing of the chat can be
      // seen until the keyboard goes, so the chat lowers it.
      await browser.setViewport(874, 296)
      await browser.evaluate(`window.__keyboard(300, 300)`)
      await sleep(1000)
      assert.equal(
        await browser.evaluate(`document.activeElement === (${input})`),
        false,
        "the keyboard stays up with no room for the chat",
      )
      const recovered = await rectOf(browser, panel)
      const recoveredField = await rectOf(browser, input)
      assert.ok(
        recovered.top <= 16 &&
          recovered.bottom === 296 &&
          recoveredField.bottom <= 296,
        `after the keyboard goes, the chat spans ${recovered.top}-${recovered.bottom}px with the message field at ${recoveredField.top}-${recoveredField.bottom}px`,
      )

      // With the toolbars still showing, tapping the field again left the
      // chat a 19-20px strip each time: innerHeight 51-52, panned 244-245px.
      // Typing a draft there worked, so the chat keeps the keyboard, fits the
      // field into the strip and offers a way out that keeps the draft.
      await browser.evaluate(`(() => {
        const input = ${input}
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, "Local draft")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })()`)
      const hideKeyboard = `document.querySelector('button[aria-label="Hide keyboard"]')`
      for (const [keyboard, offsetTop, innerHeight] of [
        [277, 245, 51],
        [276, 244, 52],
      ]) {
        await browser.click(input)
        await browser.evaluate(
          `window.__keyboard(${keyboard}, ${offsetTop}, ${innerHeight})`,
        )
        await sleep(500)
        const strip = { top: offsetTop, bottom: offsetTop + 296 - keyboard }
        assert.equal(
          await browser.evaluate(`document.activeElement === (${input})`),
          true,
          "the chat took the keyboard away from the user's tap",
        )
        const cramped = await rectOf(browser, panel)
        assert.deepEqual(
          { top: cramped.top, bottom: cramped.bottom },
          strip,
          `in a ${strip.bottom - strip.top}px strip, the chat covers what's visible`,
        )
        const field = await rectOf(browser, input)
        assert.ok(
          field.top >= strip.top && field.bottom <= strip.bottom,
          `in a ${strip.bottom - strip.top}px strip, the message field is at ${field.top}-${field.bottom}px`,
        )
        assert.ok(
          await browser.evaluate(`!!(${hideKeyboard})?.checkVisibility()`),
          `in a ${strip.bottom - strip.top}px strip, there is no way to hide the keyboard`,
        )
        const button = await rectOf(browser, hideKeyboard)
        assert.ok(
          button.top >= strip.top && button.bottom <= strip.bottom,
          `in a ${strip.bottom - strip.top}px strip, the hide keyboard button is at ${button.top}-${button.bottom}px`,
        )

        await browser.click(hideKeyboard)
        await sleep(500)
        const restored = await rectOf(browser, panel)
        assert.ok(
          restored.top <= 16 &&
            restored.bottom === 296 &&
            (await browser.evaluate<boolean>(
              `document.querySelector("h2").checkVisibility()`,
            )),
          `hiding the keyboard leaves the chat at ${restored.top}-${restored.bottom}px`,
        )
        assert.equal(
          await browser.evaluate(`(${input}).value`),
          "Local draft",
          "hiding the keyboard keeps the draft",
        )
      }
    }),
)

test(
  "on a desktop the chat leaves the recipe visible and can be maximized",
  { skip: !hasChromium && "chromium not found", timeout: 180_000 },
  () =>
    withSeededApp(async ({ browser, base, recipeId }) => {
      await browser.setViewport(1280, 800, { mobile: false })
      await enableAi(browser, base)
      await openRecipe(browser, base, recipeId)
      await openChat(browser)

      // the old default was 480 x 600
      const initial = await rectOf(browser, panel)
      const width = initial.right - initial.left
      const height = initial.bottom - initial.top
      assert.ok(
        width < 480 && height < 600,
        `the chat is ${width} x ${height}, no smaller than before`,
      )
      assert.ok(
        width >= 320 && height >= 400,
        `the chat is ${width} x ${height}, too small to use`,
      )

      await browser.click(maximize)
      await browser.waitFor(`!!(${restore})`)
      await sleep(500)
      const maximized = await rectOf(browser, panel)
      assert.ok(
        maximized.right - maximized.left >= 1280 * 0.75 &&
          maximized.bottom - maximized.top >= 800 * 0.8,
        `the maximized chat is only ${maximized.right - maximized.left} x ${maximized.bottom - maximized.top}`,
      )
      assert.ok(
        maximized.top >= 0 &&
          maximized.left >= 0 &&
          maximized.right <= 1280 &&
          maximized.bottom <= 800,
        `the maximized chat leaves the window: ${JSON.stringify(maximized)}`,
      )

      await browser.click(restore)
      await browser.waitFor(`!!(${maximize})`)
      await sleep(500)
      assert.deepEqual(
        await rectOf(browser, panel),
        initial,
        "restoring returns the chat to its default size",
      )
    }),
)
