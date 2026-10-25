import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import { type FetchEndpoint, PageFetcher } from "@/services/PageFetcher"

// A recipe page is fetched directly first, once, and through the configured
// endpoint when that fails. Only the endpoint is retried.

const page = "https://www.example.com/recipes/stew?ref=a&b=1"

const run = (
  endpoint: Option.Option<FetchEndpoint>,
  respond: (url: string) => Response,
) => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    requests.push({
      url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    })
    return respond(url)
  }
  return PageFetcher.make(Effect.succeed(endpoint)).pipe(
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

test("a blocked direct fetch falls through to the endpoint, which is retried", async () => {
  let endpointCalls = 0
  const { exit, requests } = await run(
    Option.some({
      template: "https://r.jina.ai/{url}",
      apiKey: Option.some(Redacted.make("secret")),
    }),
    (url) => {
      if (url === page) throw new TypeError("Failed to fetch")
      return ++endpointCalls === 1
        ? new Response("", { status: 503 })
        : new Response("<html>stew</html>")
    },
  )

  assert.deepEqual(exit, Exit.succeed("<html>stew</html>"))
  const endpointUrl = `https://r.jina.ai/${encodeURIComponent(page)}`
  assert.deepEqual(
    requests.map((r) => r.url),
    [page, endpointUrl, endpointUrl],
  )
  assert.equal(requests[1].headers["x-return-format"], "html")
  assert.equal(requests[1].headers["authorization"], "Bearer secret")
})

test("with no endpoint, a failed direct fetch fails without retrying", async () => {
  const { exit, requests } = await run(
    Option.none(),
    () => new Response("", { status: 503 }),
  )
  assert.ok(Exit.isFailure(exit))
  assert.deepEqual(
    requests.map((r) => r.url),
    [page],
  )
})
