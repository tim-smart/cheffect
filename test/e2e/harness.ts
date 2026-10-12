import { spawn, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createServer } from "vite"

// Runs the dev server and drives Chromium over the DevTools protocol. Set
// CHROMIUM_PATH to use another build (e.g. google-chrome-stable) or if
// `chromium` is not on the PATH.

export const chromium = process.env.CHROMIUM_PATH ?? "chromium"
export const hasChromium = spawnSync(chromium, ["--version"]).status === 0

const crashesDir = path.resolve("test-results/e2e-crashes")

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The browser crashed or stopped responding. This is a browser failure, not
 * an assertion failure, so it is reported with its own error name.
 */
export class BrowserCrashError extends Error {
  override name = "BrowserCrashError"
}

const findMinidumps = (dir: string): Array<string> =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".dmp"))
        .map((file) => path.join(dir, file))
    : []

const launchBrowser = async (profile: string) => {
  // Crashpad ignores --crash-dumps-dir on Linux and writes minidumps to
  // $XDG_CONFIG_HOME/<browser>/Crash Reports, so keep that inside the profile
  const crashDumps = path.join(profile, "config")
  const proc = spawn(
    chromium,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "about:blank",
    ],
    {
      env: { ...process.env, XDG_CONFIG_HOME: crashDumps },
      // own process group, so close() can kill every Chromium process
      detached: true,
    },
  )
  const exited = new Promise<void>((resolve) =>
    proc.on("exit", () => resolve()),
  )
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

  let crashed = false
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
    } else if (msg.method === "Inspector.targetCrashed") {
      crashed = true
    } else if (msg.method === "Page.javascriptDialogOpening") {
      // "leave site?" and confirm() prompts: the user accepts
      void send("Page.handleJavaScriptDialog", { accept: true })
    }
  })

  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }))
    .sessionId
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Inspector.enable")

  // A crashed renderer either dies (Inspector.targetCrashed) or, with some
  // builds, freezes while the crash handler writes a minidump. Both show up
  // as a DevTools call that never returns.
  const crashError = (what: string) => {
    // the profile is removed after the test, so keep the minidumps
    fs.mkdirSync(crashesDir, { recursive: true })
    const dumps = findMinidumps(crashDumps).map((dump) => {
      const kept = path.join(crashesDir, path.basename(dump))
      fs.copyFileSync(dump, kept)
      return path.relative(process.cwd(), kept)
    })
    const minidumps = dumps.length > 0 ? ` (minidump: ${dumps.join(", ")})` : ""
    return new BrowserCrashError(
      crashed || dumps.length > 0
        ? `renderer crashed during ${what}${minidumps}`
        : `renderer stopped responding during ${what}`,
    )
  }
  const sendOrCrash = async (method: string, params: object, what: string) => {
    if (crashed) throw crashError(what)
    const result = await Promise.race([
      send(method, params),
      sleep(15_000).then(() => undefined),
    ])
    if (result === undefined || crashed) throw crashError(what)
    return result
  }

  const evaluate = async <A>(expression: string): Promise<A> =>
    (
      await sendOrCrash(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        `evaluate(${expression.slice(0, 60)})`,
      )
    ).result?.value
  const waitFor = async (expression: string, timeout = 60_000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (await evaluate<boolean>(expression)) return
      await sleep(250)
    }
    throw new Error(`timed out waiting for: ${expression}`)
  }
  const navigate = (url: string) =>
    sendOrCrash("Page.navigate", { url }, `navigate(${url})`)
  /**
   * Clicks the centre of an element with real mouse events. `element` is an
   * expression that evaluates to the element.
   */
  const click = async (element: string) => {
    const { x, y } = await evaluate<{ x: number; y: number }>(`(() => {
      const rect = (${element}).getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })()`)
    for (const type of ["mousePressed", "mouseReleased"]) {
      await sendOrCrash(
        "Input.dispatchMouseEvent",
        { type, x, y, button: "left", clickCount: 1 },
        `click(${element.slice(0, 60)})`,
      )
    }
  }
  const close = async () => {
    ws.close()
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-proc.pid!, signal)
      } catch {
        // already gone
      }
    }
    killGroup("SIGTERM")
    const timeout = sleep(5000).then(() => "timeout")
    if ((await Promise.race([exited, timeout])) === "timeout") {
      killGroup("SIGKILL")
      await exited
    }
    // let the rest of the process group release the profile
    killGroup("SIGKILL")
  }
  return { evaluate, waitFor, navigate, click, close }
}

export type Browser = Awaited<ReturnType<typeof launchBrowser>>

/**
 * Starts the dev server and a fresh browser profile, opens the app so the
 * dev seed runs, and passes the id of a seeded recipe to `f`.
 */
export const withSeededApp = async (
  f: (app: {
    readonly browser: Browser
    readonly base: string
    readonly recipeId: string
  }) => Promise<void>,
) => {
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
    // let the seed events persist before leaving the page
    await sleep(5000)
    await f({ browser, base, recipeId: href.split("/recipes/")[1] })
  } finally {
    await browser.close()
    await server.close()
    fs.rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    })
  }
}
