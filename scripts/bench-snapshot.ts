// Times a recipe write until the recipes snapshot shows it, in Chromium over
// its own IndexedDB:
//
//   pnpm exec tsx scripts/bench-snapshot.ts [count...]
//
// For each count a fresh page seeds the library, then times single
// `writeEvent`s (an ingredient scale tap) and remote batches of 50 scale
// changes, each from the start of the write until the snapshot holds it.
// That covers the journal, the handler transaction, the durability barrier
// and the snapshot reload. Medians, at 1x and 4x CPU throttling.

import * as path from "node:path"
import { createServer } from "vite"
import { openBrowser } from "../test/e2e/harness"

const server = await createServer({
  configFile: path.resolve("vite.config.ts"),
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
})
await server.listen()
const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "")

const counts = process.argv.slice(2).map(Number)
for (const count of counts.length > 0 ? counts : [1000, 5000]) {
  for (const rate of [1, 4]) {
    const browser = await openBrowser()
    try {
      // Any page of the app's origin without the app on it
      await browser.navigate(`${base}/placeholder.svg`)
      await browser.throttleCpu(rate)
      await browser.evaluate(`void import("/scripts/bench-snapshot-page.ts")
        .then((m) => m.run({ count: ${count}, writes: 15, batches: 7, batchSize: 50 }))
        .then((result) => (window.__result = result), (error) => (window.__result = { error: String(error) }))`)
      await browser.waitFor(`window.__result !== undefined`, 600_000)
      const result = await browser.evaluate<{
        single: number
        batch: number
        error?: string
      }>(`window.__result`)
      if (result.error !== undefined) throw new Error(result.error)
      console.log(
        `${count} recipes at ${rate}x: write ${result.single.toFixed(1)} ms, batch of 50 ${result.batch.toFixed(1)} ms`,
      )
    } finally {
      await browser.close()
    }
  }
}

await server.close()
process.exit(0)
