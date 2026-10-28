import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as TestClock from "effect/testing/TestClock"
import * as Layer from "effect/Layer"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import {
  syncEnabledAtom,
  syncServerImportsAtom,
  syncServerUrlAtom,
} from "@/EventLog"
import {
  AiHelpers,
  aiHelpersLayer,
  openAiClientLayer,
} from "@/services/AiHelpers"
import { ImportServerError, PageFetcher } from "@/services/PageFetcher"

// A recipe page is fetched directly first, once, and through the build's
// fetch endpoint when that fails or doesn't answer in time. Only the endpoint
// is retried.

const page = "https://www.example.com/recipes/stew?ref=a&b=1"

type Respond = (
  url: string,
  signal?: AbortSignal,
) => Response | Promise<Response>

const run = (
  endpoint: string,
  respond: Respond,
  drive: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E> = (
    effect,
  ) => effect,
) => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    requests.push({
      url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    })
    return respond(url, init?.signal ?? undefined)
  }
  return PageFetcher.make(endpoint).pipe(
    Effect.flatMap((fetcher) => drive(fetcher.html(page))),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(
      FetchHttpClient.Fetch,
      fetch as typeof globalThis.fetch,
    ),
    Effect.exit,
    Effect.runPromise,
    (promise) => promise.then((exit) => ({ exit, requests })),
  )
}

test("a failed direct fetch is not retried; the endpoint is", async () => {
  let endpointCalls = 0
  const { exit, requests } = await run("https://r.jina.ai/{url}", (url) => {
    if (url === page) return new Response("", { status: 503 })
    return ++endpointCalls === 1
      ? new Response("", { status: 503 })
      : new Response("<html>stew</html>")
  })

  assert.deepEqual(exit, Exit.succeed("<html>stew</html>"))
  const endpointUrl = `https://r.jina.ai/${encodeURIComponent(page)}`
  assert.deepEqual(
    requests.map((r) => r.url),
    [page, endpointUrl, endpointUrl],
  )
  assert.equal(requests[1].headers["x-return-format"], "html")
})

test("a direct fetch that never answers falls through to the endpoint", async () => {
  const { exit, requests } = await run(
    "https://r.jina.ai/{url}",
    (url, signal) =>
      url === page
        ? new Promise((_, reject) =>
            signal?.addEventListener("abort", () => reject(signal.reason)),
          )
        : new Response("<html>stew</html>"),
    (effect) =>
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(effect)
        yield* TestClock.adjust("10 seconds")
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
  )

  assert.deepEqual(exit, Exit.succeed("<html>stew</html>"))
  assert.deepEqual(
    requests.map((r) => r.url),
    [page, `https://r.jina.ai/${encodeURIComponent(page)}`],
  )
})

test("YouTube uses one metadata request, with no browser watch request or retries on quota errors", async () => {
  const requests: string[] = []
  const result = { _tag: "Unavailable", reason: "YouTube API quota exceeded" }
  const exit = await PageFetcher.make(
    "https://example.test/fetch?url={url}",
    "https://example.test/youtube?id={id}",
  ).pipe(
    Effect.flatMap((fetcher) => fetcher.youTube("abcdefghijk")),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, (async (input) => {
      requests.push(String(input))
      return Response.json(result, { status: 403 })
    }) as typeof globalThis.fetch),
    Effect.runPromise,
  )
  assert.deepEqual(exit, result)
  assert.deepEqual(requests, ["https://example.test/youtube?id=abcdefghijk"])
})

test("static YouTube imports go straight to the HTML endpoint and do not retry bot walls", async () => {
  const requests: string[] = []
  const result = await PageFetcher.make("https://r.jina.ai/{url}").pipe(
    Effect.flatMap((fetcher) => fetcher.youTube("abcdefghijk")),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, (async (input) => {
      requests.push(String(input))
      return new Response("bot check", { status: 403 })
    }) as typeof globalThis.fetch),
    Effect.runPromise,
  )
  assert.equal(result._tag, "Unavailable")
  if (result._tag === "Unavailable")
    assert.match(result.reason!, /blocked|API/i)
  assert.deepEqual(requests, [
    "https://r.jina.ai/https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabcdefghijk",
  ])
})

const video = "https://www.youtube.com/watch?v=abcdefghijk"
const home = "https://home.example.test/cheffect"

// The checkbox changes while another runtime holds the AI layer, as the
// grocery and extraction runtimes do. Each import must use the endpoints the
// settings give at that moment, turning it on and off again. Every request
// fails, so each import shows only where it went, and the model is never
// called.
test("imports follow the sync server checkbox while another AI runtime is alive", async () => {
  const storage = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  }
  const registry = AtomRegistry.make({
    initialValues: [
      Atom.initialValue(
        openAiClientLayer,
        Layer.succeed(LanguageModel.LanguageModel, {} as any) as any,
      ),
    ],
  })
  registry.set(
    syncServerUrlAtom,
    Option.some(`wss://home.example.test/cheffect/sync`),
  )
  registry.set(syncEnabledAtom, true)

  const other = Atom.runtime((get) => get(aiHelpersLayer))
  registry.mount(other)

  let requests: string[] = []
  const importBoth = AiHelpers.runtime.fn<void>()(() =>
    AiHelpers.use((ai) =>
      Effect.all([
        Effect.exit(ai.recipeFromUrl(page)),
        Effect.exit(ai.recipeFromUrl(video)),
      ]),
    ).pipe(
      Effect.provideService(FetchHttpClient.Fetch, (async (input) => {
        requests.push(input instanceof Request ? input.url : String(input))
        return new Response("", { status: 403 })
      }) as typeof globalThis.fetch),
    ),
  )
  registry.mount(importBoth)
  const importWith = async (useForImports: boolean) => {
    registry.set(syncServerImportsAtom, useForImports)
    // the other runtime is built with these settings before the import runs
    await Effect.runPromise(AtomRegistry.getResult(registry, other))
    requests = []
    registry.set(importBoth, undefined)
    await Effect.runPromise(
      AtomRegistry.getResult(registry, importBoth, { suspendOnWaiting: true }),
    )
    return requests
  }

  const buildDefaults = [
    page,
    `https://r.jina.ai/${encodeURIComponent(page)}`,
    `https://r.jina.ai/${encodeURIComponent(video)}`,
  ]
  try {
    assert.deepEqual(await importWith(false), buildDefaults)
    assert.deepEqual(await importWith(true), [
      page,
      `${home}/fetch?url=${encodeURIComponent(page)}`,
      `${home}/youtube?id=abcdefghijk`,
    ])
    assert.deepEqual(await importWith(false), buildDefaults)
  } finally {
    registry.dispose()
  }
})

// The import server's own reason is kept, along with its name and status.
test("a YouTube failure from the import server names it and its status", async () => {
  const error = await PageFetcher.use((fetcher) =>
    fetcher.youTube("abcdefghijk"),
  ).pipe(
    Effect.flip,
    Effect.provide(
      PageFetcher.layer(Option.some(`wss://home.example.test/cheffect/sync`)),
    ),
    Effect.provideService(FetchHttpClient.Fetch, (async () =>
      Response.json(
        {
          _tag: "Unavailable",
          reason: "Video imports are busy. Try again later.",
        },
        { status: 503 },
      )) as typeof globalThis.fetch),
    Effect.runPromise,
  )
  assert.ok(error instanceof ImportServerError)
  assert.equal(
    error.message,
    "The import server home.example.test couldn't read the video (503). Video imports are busy. Try again later.",
  )
})
