import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as TestClock from "effect/testing/TestClock"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import {
  importServerUrlAtom,
  syncEnabledAtom,
  syncServerImportsAtom,
  syncServerUrlAtom,
} from "@/EventLog"
import { PageFetcher } from "@/services/PageFetcher"

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

// Both imports with the sync settings applied. Every request fails, so each
// shows only where it went: the direct attempt, then the endpoint.
const importThrough = (useForImports: boolean) => {
  const storage = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  }
  const registry = AtomRegistry.make()
  registry.set(
    syncServerUrlAtom,
    Option.some("wss://home.example.test/cheffect/sync"),
  )
  registry.set(syncEnabledAtom, true)
  registry.set(syncServerImportsAtom, useForImports)
  const requests: string[] = []
  return Effect.gen(function* () {
    const fetcher = yield* PageFetcher
    yield* Effect.exit(fetcher.html(page))
    yield* Effect.exit(fetcher.youTube("abcdefghijk"))
  }).pipe(
    Effect.provide(PageFetcher.layer(registry.get(importServerUrlAtom))),
    Effect.provideService(FetchHttpClient.Fetch, (async (input) => {
      requests.push(input instanceof Request ? input.url : String(input))
      return new Response("", { status: 403 })
    }) as typeof globalThis.fetch),
    Effect.runPromise,
    (promise) =>
      promise.then(() => {
        registry.dispose()
        return requests
      }),
  )
}

test("imports go through the sync server when it is used for imports", async () => {
  assert.deepEqual(await importThrough(true), [
    page,
    `https://home.example.test/cheffect/fetch?url=${encodeURIComponent(page)}`,
    "https://home.example.test/cheffect/youtube?id=abcdefghijk",
  ])
})

test("imports keep the build's endpoints when the sync server isn't used for them", async () => {
  assert.deepEqual(await importThrough(false), [
    page,
    `https://r.jina.ai/${encodeURIComponent(page)}`,
    "https://r.jina.ai/https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabcdefghijk",
  ])
})
