import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import {
  findYouTubeVideo,
  YouTubePage,
  youTubeWatchUrl,
} from "@/Recipes/youtube"

// Fetches the HTML of a page to import a recipe from. The browser tries the
// page directly first, which works for sites that allow cross-origin requests
// and comes from the user's own IP. Otherwise the request goes through a fetch
// endpoint, a `{url}` template picked for the build, or the sync server's when
// the user opted in.

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

export const defaultYouTubeEndpoint = (): string | undefined =>
  import.meta.env?.VITE_SYNC_SAME_ORIGIN === "true"
    ? "/youtube?id={id}"
    : import.meta.env?.VITE_VERCEL === "true"
      ? "/api/youtube?id={id}"
      : undefined

// With "Use this server for recipe imports" on, imports go through the sync
// server instead: its `/fetch` and `/youtube` routes sit beside `/sync`, under
// whatever path a reverse proxy serves it from. `server` names it in errors.
export const importEndpoints = (
  syncUrl: Option.Option<string>,
): {
  readonly fetch: string
  readonly youTube: string | undefined
  readonly server?: string
} =>
  syncUrl.pipe(
    Option.flatMap(
      Option.liftThrowable(
        (url: string) => new URL(url.replace(/^ws(s?):/i, "http$1:")),
      ),
    ),
    Option.match({
      onNone: () => ({
        fetch: defaultFetchEndpoint(),
        youTube: defaultYouTubeEndpoint(),
      }),
      onSome: (base) => ({
        fetch: `${new URL("fetch", base).href}?url={url}`,
        youTube: `${new URL("youtube", base).href}?id={id}`,
        server: base.host,
      }),
    }),
  )

// An import through the sync server failed. It doesn't fall back to the
// build's endpoint: the user picked this server, and a fallback would hide one
// that isn't set up to answer this app.
export class ImportServerError extends Schema.TaggedError<ImportServerError>()(
  "ImportServerError",
  { message: Schema.String },
) {}

// A browser that may not read the answer reports a transport error, the same
// as a server that is down.
const importServerError =
  (server: string, what: string) =>
  (error: unknown): ImportServerError => {
    if (error instanceof ImportServerError) return error
    const status =
      error instanceof HttpClientError.HttpClientError
        ? error.response?.status
        : undefined
    return new ImportServerError({
      message:
        status === undefined
          ? `Couldn't reach the import server ${server}. Check that it's running and that its CORS_ALLOWED_ORIGINS includes ${globalThis.location?.origin ?? "this app's origin"}.`
          : `The import server ${server} couldn't ${what} (${status}).`,
    })
  }

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
    make: Effect.fnUntraced(function* (
      endpoint: string,
      youTubeEndpoint?: string,
      server?: string,
    ) {
      const rawClient = (yield* HttpClient.HttpClient).pipe(
        HttpClient.transformResponse(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        ),
      )
      const client = rawClient.pipe(HttpClient.filterStatusOk)
      // Transport errors, timeouts and 408/429/5xx responses, honouring
      // Retry-After. Bot walls (402, 403) are not retried.
      const endpointClient = client.pipe(
        HttpClient.retryTransient({
          schedule: Schedule.spaced(1000),
          times: 3,
        }),
      )

      // Tried once: a site without CORS headers fails as a transport error,
      // which retrying won't fix. A site that never answers falls through to
      // the endpoint after a deadline.
      const direct = (url: string) =>
        client.get(url).pipe(
          Effect.flatMap((r) => r.text),
          Effect.timeout("10 seconds"),
        )

      // The deadline covers every attempt, so a stalled endpoint still fails
      // the import.
      const viaEndpoint = (url: string) =>
        endpointClient.execute(endpointRequest(endpoint, url)).pipe(
          Effect.flatMap((r) => r.text),
          Effect.timeout("1 minute"),
          Effect.mapError((error) =>
            server === undefined
              ? error
              : importServerError(server, "fetch the page")(error),
          ),
        )

      const html = Effect.fn("PageFetcher.html")(function* (url: string) {
        return yield* direct(url).pipe(Effect.catch(() => viaEndpoint(url)))
      })

      // YouTube does not allow browser CORS reads. Do not send a watch request
      // we already know cannot work, or retry a quota/bot-check rejection.
      const youTube = Effect.fn("PageFetcher.youTube")(
        function* (id: string) {
          if (youTubeEndpoint !== undefined) {
            const target = new URL(
              youTubeEndpoint.replaceAll("{id}", encodeURIComponent(id)),
              globalThis.location?.href,
            )
            const response = yield* rawClient.get(target)
            const page = yield* Schema.decodeUnknownEffect(YouTubePage)(
              yield* response.json,
            )
            // A server the user picked is named with its status, keeping its
            // reason.
            if (
              server !== undefined &&
              page._tag === "Unavailable" &&
              response.status >= 300
            ) {
              return yield* new ImportServerError({
                message: `The import server ${server} couldn't read the video (${response.status}).${page.reason === null ? "" : ` ${page.reason}`}`,
              })
            }
            return page
          }
          const response = yield* client.execute(
            endpointRequest(endpoint, youTubeWatchUrl(id)),
          )
          return findYouTubeVideo(yield* response.text)
        },
        // The server looks up the transcript after the video, each with its
        // own deadline.
        Effect.timeout("30 seconds"),
        Effect.catch((error) =>
          server === undefined
            ? Effect.succeed({
                _tag: "Unavailable",
                reason:
                  "YouTube could not be read or blocked the request. Try again later. Server operators can configure YOUTUBE_API_KEY for public video imports.",
              } as const)
            : Effect.fail(importServerError(server, "read the video")(error)),
        ),
      )

      return { html, youTube } as const
    }),
  },
) {
  static readonly layer = (syncUrl: Option.Option<string>) => {
    const endpoints = importEndpoints(syncUrl)
    return Layer.effect(
      this,
      this.make(endpoints.fetch, endpoints.youTube, endpoints.server),
    ).pipe(Layer.provide(FetchHttpClient.layer))
  }
}
