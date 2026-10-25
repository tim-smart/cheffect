import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import { PageFetcher } from "@/services/PageFetcher"

// A recipe page is fetched directly first, once, and through the build's
// fetch endpoint when that fails. Only the endpoint is retried.

const page = "https://www.example.com/recipes/stew?ref=a&b=1"

const run = (endpoint: string, respond: (url: string) => Response) => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    requests.push({
      url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    })
    return respond(url)
  }
  return PageFetcher.make(endpoint).pipe(
    Effect.flatMap((fetcher) => fetcher.html(page)),
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
