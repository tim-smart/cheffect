// Times the recipes page in a production build over a large library:
//
//   pnpm exec tsx scripts/bench-recipes-browser.ts [count...]
//
// Chromium runs headless at 4x CPU throttling, about a mid-range phone. For
// each count the library is written straight into the recipes table, then
// the page is loaded and a search typed into it. A keystroke is timed from
// the input event to two frames: the one showing the typed character, and
// the one showing the last change it made to the page, i.e. its results.

import * as path from "node:path"
import { build, preview } from "vite"
import { openBrowser, sleep, type Browser } from "../test/e2e/harness"
import { encodeRows, makeLibrary } from "./recipeLibrary"

const configFile = path.resolve("vite.config.ts")
await build({ configFile, logLevel: "error" })
const server = await preview({
  configFile,
  preview: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
})
const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "")

// Bytes don't survive JSON, so ids travel as arrays and are rebuilt in the page.
const seed = (browser: Browser, count: number) => {
  const rows = JSON.stringify(encodeRows(makeLibrary(count)), (_, value) =>
    value instanceof Uint8Array ? { bytes: Array.from(value) } : value,
  )
  return browser.evaluate(`new Promise((resolve, reject) => {
    const rows = JSON.parse(${JSON.stringify(rows)}, (_, value) =>
      value && Array.isArray(value.bytes) ? new Uint8Array(value.bytes) : value)
    const open = indexedDB.open("cheffect")
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction("recipes", "readwrite")
      const store = tx.objectStore("recipes")
      for (const row of rows) store.put(row)
      tx.oncomplete = () => (db.close(), resolve(rows.length))
      tx.onerror = () => reject(tx.error)
    }
  })`)
}

// Records when the first tile shows, and when each keystroke's input and
// results are painted. Attribute changes are left out, as a photo fading in
// changes a class.
const instrument = `
  window.__bench = { firstTile: null, keystrokes: [] }
  const watch = () => {
    if (document.querySelector('a[href^="/recipes/"]')) {
      window.__bench.firstTile = performance.now()
      return
    }
    requestAnimationFrame(watch)
  }
  requestAnimationFrame(watch)
  const painted = (f) => requestAnimationFrame(() => setTimeout(f))
  let keystroke = null
  addEventListener("input", (event) => {
    const current = { start: event.timeStamp, input: null, results: null }
    keystroke = current
    window.__bench.keystrokes.push(current)
    painted(() => {
      current.input = performance.now() - current.start
      current.results ??= current.input
    })
  }, true)
  new MutationObserver(() => {
    const current = keystroke
    if (current === null) return
    painted(() => (current.results = performance.now() - current.start))
  }).observe(document, { childList: true, subtree: true, characterData: true })
`

interface Keystroke {
  readonly input: number
  readonly results: number
}

const percentile = (values: ReadonlyArray<number>, p: number) => {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
}

const word = "chicken"
const rounds = 8

const counts = process.argv.slice(2).map(Number)
for (const count of counts.length > 0 ? counts : [1000, 5000]) {
  const browser = await openBrowser()
  try {
    await browser.setViewport(390, 844)
    // The first load creates the database
    await browser.navigate(`${base}/`)
    await browser.waitFor(`document.body.innerText.includes("0 saved")`)
    await seed(browser, count)

    await browser.addInitScript(instrument)
    await browser.throttleCpu(4)
    const loads: Array<number> = []
    for (let i = 0; i < rounds; i++) {
      await browser.navigate(`${base}/`)
      await browser.waitFor(`window.__bench?.firstTile !== null`, 60_000)
      loads.push(await browser.evaluate<number>(`window.__bench.firstTile`))
    }

    await browser.click(
      `document.querySelector('input[placeholder="Search recipes..."]')`,
    )
    // Typing the word, then deleting it
    const keystrokes: Array<Keystroke> = []
    const cleared: Array<Keystroke> = []
    for (let i = 0; i < rounds; i++) {
      await browser.evaluate(`void (window.__bench.keystrokes = [])`)
      for (const key of word) {
        await browser.press(key, `Key${key.toUpperCase()}`, key.charCodeAt(0))
        await sleep(400)
      }
      for (const _ of word) {
        await browser.press("Backspace", "Backspace", 8)
        await sleep(400)
      }
      const round = await browser.evaluate<Array<Keystroke>>(
        `window.__bench.keystrokes`,
      )
      keystrokes.push(...round)
      // The last backspace empties the search and brings back every recipe
      cleared.push(round.at(-1)!)
    }

    const input = keystrokes.map((k) => k.input)
    const results = keystrokes.map((k) => k.results)
    console.log(`\n${count} recipes`)
    const report = (name: string, ms: number) =>
      console.log(`  ${name.padEnd(32)} ${ms.toFixed(0).padStart(6)} ms`)
    report("load to first tile, median", percentile(loads, 0.5))
    report("keystroke to input, median", percentile(input, 0.5))
    report("keystroke to input, p90", percentile(input, 0.9))
    report("keystroke to results, median", percentile(results, 0.5))
    report("keystroke to results, p90", percentile(results, 0.9))
    report(
      "clear to full list, median",
      percentile(
        cleared.map((k) => k.results),
        0.5,
      ),
    )
  } finally {
    await browser.close()
  }
}

await server.close()
process.exit(0)
