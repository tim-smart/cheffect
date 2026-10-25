import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { importFetchApiKey, importFetchUrl } from "@/Settings"

// Fetches the HTML of a page to import a recipe from. The browser tries the
// page directly first, which works for sites that allow cross-origin requests
// and comes from the user's own IP. Otherwise the request goes through the
// configured fetch endpoint, a `{url}` template such as the Docker server's
// `/fetch?url={url}` or `https://r.jina.ai/{url}`.

export interface FetchEndpoint {
  readonly template: string
  readonly apiKey: Option.Option<Redacted.Redacted<string>>
}

// Headers some endpoints need to return the page's raw HTML.
const hostHeaders: Record<string, Record<string, string>> = {
  "r.jina.ai": { "x-return-format": "html" },
}

export const endpointRequest = (
  endpoint: FetchEndpoint,
  url: string,
): HttpClientRequest.HttpClientRequest => {
  const target = new URL(
    endpoint.template.replaceAll("{url}", encodeURIComponent(url)),
    globalThis.location?.href,
  )
  return HttpClientRequest.get(target).pipe(
    HttpClientRequest.setHeaders(hostHeaders[target.hostname] ?? {}),
    Option.match(endpoint.apiKey, {
      onNone: () => (request) => request,
      onSome: (key) => HttpClientRequest.bearerToken(Redacted.value(key)),
    }),
  )
}

export class PageFetcher extends Context.Service<PageFetcher>()(
  "cheffect/services/PageFetcher",
  {
    make: Effect.fnUntraced(function* (
      endpoint: Effect.Effect<Option.Option<FetchEndpoint>>,
    ) {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.transformResponse(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        ),
        HttpClient.filterStatusOk,
      )
      // Transport errors, timeouts and 408/429/5xx responses, honouring
      // Retry-After. Bot walls (402, 403) are not retried.
      const endpointClient = client.pipe(
        HttpClient.retryTransient({
          schedule: Schedule.spaced(1000),
          times: 3,
        }),
      )

      // Tried once: a site without CORS headers fails as a transport error,
      // which retrying won't fix.
      const direct = (url: string) =>
        client.get(url).pipe(Effect.flatMap((r) => r.text))

      const html = Effect.fn("PageFetcher.html")(function* (url: string) {
        const configured = yield* endpoint
        return yield* direct(url).pipe(
          Effect.catch((error) =>
            Option.match(configured, {
              onNone: () => Effect.fail(error),
              onSome: (endpoint) =>
                endpointClient
                  .execute(endpointRequest(endpoint, url))
                  .pipe(Effect.flatMap((r) => r.text)),
            }),
          ),
        )
      })

      return { html } as const
    }),
  },
) {
  // The endpoint is read from settings on every fetch, so a change applies
  // to the next import without restarting the queue.
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const context = yield* Effect.context<AtomRegistry.AtomRegistry>()
      return yield* PageFetcher.make(
        Effect.all({
          template: Atom.getResult(importFetchUrl.atom),
          apiKey: Atom.getResult(importFetchApiKey.atom),
        }).pipe(
          Effect.map(({ template, apiKey }) =>
            Option.map(template, (template) => ({ template, apiKey })),
          ),
          Effect.orElseSucceed(Option.none),
          Effect.provideContext(context),
        ),
      )
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}
