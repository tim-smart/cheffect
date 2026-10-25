import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import { flow } from "effect"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import { pipe } from "effect/Function"

export class CorsProxy extends Context.Service<CorsProxy>()("CorsProxy", {
  make: Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(
        flow(HttpClientRequest.prependUrl("https://api.allorigins.win")),
      ),
      HttpClient.transformResponse(
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      ),
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

    return { html } as const
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(FetchHttpClient.layer),
  )
}
