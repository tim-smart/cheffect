import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import { flow } from "effect"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Cheerio from "cheerio"
import { pipe } from "effect/Function"

export class CorsProxy extends Effect.Service<CorsProxy>()("CorsProxy", {
  dependencies: [FetchHttpClient.layer],
  scoped: Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(
        flow(HttpClientRequest.prependUrl("https://api.allorigins.win")),
      ),
      HttpClient.withTracerPropagation(false),
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({
        schedule: Schedule.spaced(1000),
      }),
    )

    const html = (url: string) =>
      pipe(
        client.get("/raw", { urlParams: { url } }),
        Effect.flatMap((r) => r.text),
      )

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
          $("#comments").remove()
          $("#reviews").remove()
          $("iframe").remove()
          $("form").remove()
          $(".ad").remove()
          $(".advertisement").remove()
          $("[aria-hidden='true']").remove()
          $.root()
            .contents()
            .filter(function () {
              return this.type === "comment"
            })
            .remove()
          $("*").each(function () {
            const $el = $(this)
            if ($el.is("meta, img")) {
              return
            } else if ($el.find("img").length > 0) {
              return
            } else if ($el.text().trim() === "") {
              $el.remove()
            } else if ("attribs" in this) {
              this.attribs = {}
            }
          })
          const stripped = $.html()
          return stripped.replace(/\s+/g, " ").trim()
        }),
      )

    return { html, htmlStripped } as const
  }),
}) {}
