import { test } from "node:test"
import * as assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createServer } from "vite"

// Saving a recipe from an edit page that was opened directly (by URL) calls
// history.back(), which unloads the document straight after the commit. The
// edit must still be persisted.
//
// Runs the dev server and drives Chromium over the DevTools protocol. Set
// CHROMIUM_PATH if `chromium` is not on the PATH.

const chromium = process.env.CHROMIUM_PATH ?? "chromium"
const hasChromium = spawnSync(chromium, ["--version"]).status === 0

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const launchBrowser = async (profile: string) => {
  const proc = spawn(chromium, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "about:blank",
  ])
  const wsUrl = await new Promise<string>((resolve, reject) => {
    let stderr = ""
    proc.stderr.on("data", (chunk) => {
      stderr += chunk
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) resolve(match[1])
    })
    proc.on("exit", () => reject(new Error(`chromium exited: ${stderr}`)))
  })
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve) => ws.addEventListener("open", resolve))

  let id = 0
  const pending = new Map<number, (result: any) => void>()
  let sessionId: string | undefined
  const send = (method: string, params: object = {}): Promise<any> =>
    new Promise((resolve) => {
      const msgId = ++id
      pending.set(msgId, resolve)
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }))
    })
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id !== undefined) {
      pending.get(msg.id)?.(msg.result ?? msg.error)
      pending.delete(msg.id)
    } else if (msg.method === "Page.javascriptDialogOpening") {
      // "leave site?" prompt: the user leaves anyway
      void send("Page.handleJavaScriptDialog", { accept: true })
    }
  })

  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }))
    .sessionId
  await send("Page.enable")
  await send("Runtime.enable")

  const evaluate = async <A>(expression: string): Promise<A> =>
    (
      await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result?.value
  const waitFor = async (expression: string, timeout = 60_000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (await evaluate<boolean>(expression).catch(() => false)) return
      await sleep(250)
    }
    throw new Error(`timed out waiting for: ${expression}`)
  }
  const navigate = (url: string) => send("Page.navigate", { url })
  const close = () => {
    ws.close()
    proc.kill()
  }
  return { evaluate, waitFor, navigate, close }
}

test(
  "an edit saved from a directly opened edit page is persisted",
  { skip: !hasChromium && "chromium not found", timeout: 120_000 },
  async () => {
    const server = await createServer({
      configFile: path.resolve("vite.config.ts"),
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    })
    await server.listen()
    const base = server.resolvedUrls!.local[0].replace(/\/$/, "")
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cheffect-e2e-"))
    const browser = await launchBrowser(profile)
    try {
      // the dev server seeds recipes into an empty store
      await browser.navigate(`${base}/`)
      await browser.waitFor(`!!document.querySelector('a[href^="/recipes/"]')`)
      const href = await browser.evaluate<string>(
        `document.querySelector('a[href^="/recipes/"]').getAttribute("href")`,
      )
      const id = href.split("/recipes/")[1]
      // let the seed events persist before leaving the page
      await sleep(5000)

      // open the edit page directly, change the title and save
      await browser.navigate(`${base}/edit/${id}`)
      await browser.waitFor(`!!document.querySelector('input[name="title"]')`)
      const original = await browser.evaluate<string>(
        `document.querySelector('input[name="title"]').value`,
      )
      await browser.evaluate(`(() => {
        const input = document.querySelector('input[name="title"]')
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setValue.call(input, "Edited after direct open")
        input.dispatchEvent(new Event("input", { bubbles: true }))
        document.querySelector('form button[type="submit"]').click()
      })()`)
      await browser.waitFor(`!location.pathname.startsWith("/edit/")`, 15_000)
      await sleep(2000)

      await browser.navigate(`${base}/recipes/${id}`)
      const titles = JSON.stringify([original, "Edited after direct open"])
      await browser.waitFor(
        `[...document.querySelectorAll("h1")].some((h1) => ${titles}.includes(h1.textContent))`,
      )
      const shown = await browser.evaluate<Array<string>>(
        `[...document.querySelectorAll("h1")].map((h1) => h1.textContent)`,
      )
      assert.ok(
        shown.includes("Edited after direct open"),
        `recipe still shows ${JSON.stringify(shown)}`,
      )
    } finally {
      browser.close()
      await server.close()
      fs.rmSync(profile, { recursive: true, force: true })
    }
  },
)
