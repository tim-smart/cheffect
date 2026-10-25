import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"

// Fetches the HTML of a page to import a recipe from. The browser tries the
// page directly first, which works for sites that allow cross-origin requests
// and comes from the user's own IP. Otherwise the request goes through a fetch
// endpoint, a `{url}` template picked for the build.

// The Docker image and Vercel deployments fetch through their own server.
// Every other build, dev included, uses Jina Reader, which allows
// cross-origin requests and needs no key. Outside Vite (node tests)
// `import.meta.env` is undefined.
export const defaultFetchEndpoint = (): string =>
  import.meta.env?.VITE_SYNC_SAME_ORIGIN === "true"
    ? "/fetch?url={url}"
    : import.meta.env?.VITE_VERCEL === "true"
      ? "/api/fetch?url={url}"
      : "https://r.jina.ai/{url}"

// Headers some endpoints need to return the page's raw HTML.
const hostHeaders: Record<string, Record<string, string>> = {
  "r.jina.ai": { "x-return-format": "html" },
}

const endpointRequest = (
  template: string,
  url: string,
): HttpClientRequest.HttpClientRequest => {
  const target = new URL(
    template.replaceAll("{url}", encodeURIComponent(url)),
    globalThis.location?.href,
  )
  return HttpClientRequest.get(target).pipe(
    HttpClientRequest.setHeaders(hostHeaders[target.hostname] ?? {}),
  )
}

export class PageFetcher extends Context.Service<PageFetcher>()(
  "cheffect/services/PageFetcher",
  {
    make: Effect.fnUntraced(function* (endpoint: string) {
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

      const viaEndpoint = (url: string) =>
        endpointClient
          .execute(endpointRequest(endpoint, url))
          .pipe(Effect.flatMap((r) => r.text))

      const html = Effect.fn("PageFetcher.html")(function* (url: string) {
        return yield* direct(url).pipe(Effect.catch(() => viaEndpoint(url)))
      })

      return { html } as const
    }),
  },
) {
  static readonly layer = Layer.effect(
    this,
    this.make(defaultFetchEndpoint()),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}
