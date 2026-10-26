import { spawn, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createServer } from "vite"

// Runs the dev server and drives Chromium over the DevTools protocol. Set
// CHROMIUM_PATH to use another build (e.g. google-chrome-stable) or if
// `chromium` is not on the PATH.

export const chromium = process.env.CHROMIUM_PATH ?? "chromium"
const browserCheck = spawnSync(chromium, ["--version"], {
  encoding: "utf8",
  timeout: 10_000,
})
export const hasChromium = browserCheck.status === 0
if (
  !hasChromium &&
  (process.env.CHROMIUM_PATH !== undefined ||
    process.env.E2E_REQUIRE_BROWSER === "1")
) {
  const reason =
    browserCheck.error?.message ??
    `exit ${browserCheck.status}, signal ${browserCheck.signal}: ${browserCheck.stderr.trim()}`
  throw new Error(
    `Browser preflight failed for ${JSON.stringify(chromium)}: ${reason}. Set CHROMIUM_PATH to an available browser executable.`,
  )
}

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

// One Chromium per test process. Each test gets its own browser context,
// with its own storage, so tests don't share data but skip the launch.
const launchChromium = async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cheffect-e2e-"))
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
      // own process group, so every Chromium process can be killed at exit
      detached: true,
    },
  )
  let exited = false
  proc.on("exit", () => {
    exited = true
  })
  // `--test-force-exit` ends the run without waiting for anything, so the
  // browser goes with the process
  process.on("exit", () => {
    try {
      process.kill(-proc.pid!, "SIGKILL")
    } catch {
      // already gone
    }
    fs.rmSync(profile, { recursive: true, force: true })
  })
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
  // events for each attached page, by session
  const sessions = new Map<string, (msg: any) => void>()
  const send = (
    method: string,
    params: object = {},
    sessionId?: string,
  ): Promise<any> =>
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
    } else if (msg.sessionId !== undefined) {
      sessions.get(msg.sessionId)?.(msg)
    }
  })
  return { send, sessions, crashDumps, exited: () => exited }
}

type Chromium = Awaited<ReturnType<typeof launchChromium>>

let sharedChromium: Promise<Chromium> | undefined
const getChromium = async () => {
  // a browser that died takes only the test it died in
  if (sharedChromium === undefined || (await sharedChromium).exited()) {
    sharedChromium = launchChromium()
  }
  return sharedChromium
}

// A page in a fresh browser context: empty storage, as a new profile has.
const openPage = async (chrome: Chromium) => {
  const { browserContextId } = await chrome.send("Target.createBrowserContext")
  const { targetId } = await chrome.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  })
  const { sessionId } = await chrome.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  })
  const send = (method: string, params: object = {}) =>
    chrome.send(method, params, sessionId)
  let crashed = false
  chrome.sessions.set(sessionId, (msg) => {
    if (msg.method === "Inspector.targetCrashed") {
      crashed = true
    } else if (msg.method === "Page.javascriptDialogOpening") {
      // "leave site?" and confirm() prompts: the user accepts
      void send("Page.handleJavaScriptDialog", { accept: true })
    }
  })
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Inspector.enable")
  const crashDumps = chrome.crashDumps

  // A crashed renderer either dies (Inspector.targetCrashed) or, with some
  // builds, freezes while the crash handler writes a minidump. Both show up
  // as a DevTools call that never returns.
  const crashError = (what: string) => {
    // the profile is removed at exit, so keep the minidumps
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
  const waitFor = async (expression: string, timeout = 20_000) => {
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
   * The centre of an element, once it has stopped moving. `element` is an
   * expression that evaluates to the element.
   *
   * Mouse events go to a fixed point, so the element has to have stopped
   * moving first: a dialog scales in for 200 ms, and a point taken mid-animation
   * misses the button by the time the events land. The centre is read once a
   * frame until two frames agree. An element still moving after two seconds
   * fails the action without sending any mouse events, rather than missing.
   */
  const settledCentre = async (element: string, what: string) => {
    const { x, y, settled, elapsed } = await evaluate<{
      x: number
      y: number
      settled: boolean
      elapsed: number
    }>(`new Promise((resolve) => {
      const start = performance.now()
      let last
      const check = () => {
        const rect = (${element}).getBoundingClientRect()
        const x = rect.x + rect.width / 2
        const y = rect.y + rect.height / 2
        const settled = last !== undefined && last.x === x && last.y === y
        const elapsed = Math.round(performance.now() - start)
        if (settled || elapsed > 2000) return resolve({ x, y, settled, elapsed })
        last = { x, y }
        requestAnimationFrame(check)
      }
      check()
    })`)
    if (!settled) {
      throw new Error(
        `${what}(${element.slice(0, 60)}): the element was still moving after ${elapsed} ms`,
      )
    }
    return { x, y }
  }
  const mouse = (
    type: string,
    x: number,
    y: number,
    what: string,
    buttons: number,
  ) =>
    sendOrCrash(
      "Input.dispatchMouseEvent",
      { type, x, y, button: "left", buttons, clickCount: 1 },
      what,
    )
  /** Clicks the centre of an element with real mouse events. */
  const click = async (element: string) => {
    const what = `click(${element.slice(0, 60)})`
    const { x, y } = await settledCentre(element, "click")
    await mouse("mousePressed", x, y, what, 1)
    await mouse("mouseReleased", x, y, what, 0)
  }
  /** Moves the pointer to the centre of an element and leaves it there. */
  const hover = async (element: string) => {
    const what = `hover(${element.slice(0, 60)})`
    const { x, y } = await settledCentre(element, "hover")
    await mouse("mouseMoved", x, y, what, 0)
  }
  /**
   * Presses the centre of an element, drags `offsetY` pixels off it and
   * releases there, so the press ends without a click on the element.
   */
  const cancelledPress = async (element: string, offsetY: number) => {
    const what = `cancelledPress(${element.slice(0, 60)})`
    const { x, y } = await settledCentre(element, "cancelledPress")
    await mouse("mousePressed", x, y, what, 1)
    await mouse("mouseMoved", x, y + offsetY, what, 1)
    await mouse("mouseReleased", x, y + offsetY, what, 0)
  }
  /**
   * Swipes a finger `dx` pixels across the centre of an element, with touch
   * events: left for a negative `dx`. A swipe is not a tap, so focus stays
   * where it was.
   */
  const swipe = async (element: string, dx: number) => {
    const what = `swipe(${element.slice(0, 60)})`
    const { x, y } = await settledCentre(element, "swipe")
    await sendOrCrash(
      "Emulation.setTouchEmulationEnabled",
      { enabled: true },
      what,
    )
    const touch = (
      type: string,
      touchPoints: Array<{ x: number; y: number }>,
    ) => sendOrCrash("Input.dispatchTouchEvent", { type, touchPoints }, what)
    await touch("touchStart", [{ x, y }])
    for (let step = 1; step <= 5; step++) {
      await sleep(20)
      await touch("touchMove", [{ x: x + (dx * step) / 5, y }])
    }
    await touch("touchEnd", [])
  }
  /**
   * Presses and releases a key with real key events, so the browser runs the
   * default action: Space on a focused button clicks it, which a synthetic
   * KeyboardEvent never does. `key` is the KeyboardEvent key (" ", "Enter").
   * `modifiers` are the keys held down with it: Alt 1, Ctrl 2, Meta 4,
   * Shift 8, summed.
   */
  const press = async (
    key: string,
    code: string,
    keyCode: number,
    modifiers = 0,
  ) => {
    const what = `press(${key})`
    const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers }
    await sendOrCrash(
      "Input.dispatchKeyEvent",
      {
        type: "keyDown",
        // a held modifier makes the key a command, not text
        text: key.length === 1 && modifiers === 0 ? key : undefined,
        ...base,
      },
      what,
    )
    await sendOrCrash(
      "Input.dispatchKeyEvent",
      { type: "keyUp", ...base },
      what,
    )
  }
  /**
   * Emulates a screen of the given size, in CSS pixels: a phone by default,
   * or a desktop window with `{ mobile: false }`.
   */
  const setViewport = (
    width: number,
    height: number,
    { mobile = true }: { readonly mobile?: boolean } = {},
  ) =>
    sendOrCrash(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile },
      `setViewport(${width}, ${height})`,
    )
  /** Slows the page's CPU by `rate`, e.g. 4 for a mid-range phone. */
  const throttleCpu = (rate: number) =>
    sendOrCrash(
      "Emulation.setCPUThrottlingRate",
      { rate },
      `throttleCpu(${rate})`,
    )
  /** Runs `source` in every document loaded from now on, before its scripts. */
  const addInitScript = (source: string) =>
    sendOrCrash(
      "Page.addScriptToEvaluateOnNewDocument",
      { source },
      "addInitScript",
    )
  const close = async () => {
    chrome.sessions.delete(sessionId)
    // a hung renderer can hold this up; the context goes at exit regardless
    await Promise.race([
      chrome.send("Target.disposeBrowserContext", { browserContextId }),
      sleep(5000),
    ])
  }
  return {
    evaluate,
    waitFor,
    navigate,
    click,
    hover,
    cancelledPress,
    swipe,
    press,
    setViewport,
    throttleCpu,
    addInitScript,
    close,
  }
}

export type Browser = Awaited<ReturnType<typeof openPage>>

/** A page in a fresh browser context, for scripts that drive the app. */
export const openBrowser = async () => openPage(await getChromium())

// The number of entries in the app's journal, through a separate connection,
// as the next page load would see them.
const journalEntries = `new Promise((resolve, reject) => {
  const open = indexedDB.open("cheffect_journal")
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const db = open.result
    const request = db.transaction("entries").objectStore("entries").count()
    request.onsuccess = () => (db.close(), resolve(request.result))
    request.onerror = () => (db.close(), reject(request.error))
  }
})`

/**
 * Waits for the app's writes to persist: the journal holds entries and has
 * stopped growing. Writes land within milliseconds of each other, so half a
 * second without a new entry means they are done.
 */
export const journalSettled = async (browser: Browser) => {
  const deadline = Date.now() + 30_000
  let entries = 0
  for (let unchanged = 0; unchanged < 5;) {
    if (Date.now() > deadline) {
      throw new Error(`the journal did not settle in 30s (${entries} entries)`)
    }
    await sleep(100)
    const count = await browser.evaluate<number>(journalEntries)
    unchanged = count > 0 && count === entries ? unchanged + 1 : 0
    entries = count
  }
}

// The dev server `setup.ts` started for the run, or one for this process
// when a test file is run on its own.
let sharedServer: Promise<string> | undefined
const getServer = () =>
  (sharedServer ??= process.env.CHEFFECT_E2E_BASE
    ? Promise.resolve(process.env.CHEFFECT_E2E_BASE)
    : createServer({
        configFile: path.resolve("vite.config.ts"),
        server: { host: "127.0.0.1", port: 0 },
        logLevel: "error",
      }).then(async (server) => {
        await server.listen()
        return server.resolvedUrls!.local[0].replace(/\/$/, "")
      }))

/**
 * Opens the app in a fresh browser context so the dev seed runs, and passes
 * the id of a seeded recipe to `f`. `init` runs in the page before the app
 * does, for settings the seed reads.
 */
export const withSeededApp = async (
  f: (app: {
    readonly browser: Browser
    readonly base: string
    readonly recipeId: string
  }) => Promise<void>,
  { init }: { readonly init?: string } = {},
) => {
  const base = await getServer()
  const browser = await openPage(await getChromium())
  try {
    if (init !== undefined) await browser.addInitScript(init)
    // the dev server seeds recipes into an empty store; the first load
    // transforms every module
    await browser.navigate(`${base}/`)
    await browser.waitFor(
      `!!document.querySelector('a[href^="/recipes/"]')`,
      60_000,
    )
    const href = await browser.evaluate<string>(
      `document.querySelector('a[href^="/recipes/"]').getAttribute("href")`,
    )
    // let the seed events persist before leaving the page
    await journalSettled(browser)
    await f({ browser, base, recipeId: href.split("/recipes/")[1] })
  } finally {
    await browser.close()
  }
}
