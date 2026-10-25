import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as TestClock from "effect/testing/TestClock"
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
