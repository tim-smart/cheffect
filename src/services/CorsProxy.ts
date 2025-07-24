import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import { flow } from "effect"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Cheerio from "cheerio"

export class CorsProxy extends Effect.Service<CorsProxy>()("CorsProxy", {
  dependencies: [FetchHttpClient.layer],
  scoped: Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(
        flow(HttpClientRequest.prependUrl("https://corsproxy.io")),
      ),
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({
        schedule: Schedule.spaced(1000),
      }),
    )

    const html = (url: string) =>
      client
        .get("/", { urlParams: { url } })
        .pipe(Effect.flatMap((_) => _.text))

    const htmlStripped = (url: string) =>
      html(url).pipe(
        Effect.map((html) => {
          const $ = Cheerio.load(html)
          $("script").remove()
          $("noscript").remove()
          $("style").remove()
          $("link").remove()
          $("nav").remove()
          $("svg").remove()
          $("*")
            .filter(function () {
              return (
                this.type === "comment" ||
                (this.type === "text" && !$(this).text().trim())
              )
            })
            .remove()
          return $.html().replace(/\s+/g, " ").trim()
        }),
      )

    return { html, htmlStripped } as const
  }),
}) {}
