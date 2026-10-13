import { test } from "node:test"
import * as assert from "node:assert/strict"
import {
  OpenAiClient,
  OpenAiLanguageModel,
  OpenAiTool,
} from "@effect/ai-openai"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as Toolkit from "effect/ai/Toolkit"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Stream from "effect/Stream"
import fixture from "./fixtures/openai-web-search-stream.json" with { type: "json" }

// Responses API streams that the chat must accept. They include web search
// actions with missing fields, a web search call without an action, a
// completed response without `incomplete_details` and the `in_memory` prompt
// cache retention. v4 accepts most of these; patches/@effect__ai-openai@4.0.4.patch
// covers `find_in_page` actions without `pattern`.

const sse = fixture
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join("")

const MockHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(sse, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    ),
  ),
)

const OpenAi = OpenAiClient.layer({ apiKey: Redacted.make("test") }).pipe(
  Layer.provide(MockHttpClient),
)

const toolkit = Toolkit.make(OpenAiTool.WebSearch({}))

test("streams a web search response without decode errors", async () => {
  const parts = await LanguageModel.streamText({
    prompt: "What is in season?",
    toolkit,
  }).pipe(
    Stream.runCollect,
    Effect.provide(OpenAiLanguageModel.model("gpt-5.4")),
    Effect.provide(OpenAi),
    Effect.runPromise,
  )

  assert.deepEqual(
    parts.filter((part) => part.type === "error"),
    [],
  )
  assert.equal(parts.filter((part) => part.type === "tool-result").length, 4)
  assert.equal(
    parts
      .flatMap((part) => (part.type === "text-delta" ? [part.delta] : []))
      .join(""),
    "Pumpkins are in season.",
  )
  const finish = parts.find((part) => part.type === "finish")
  assert.equal(finish?.reason, "stop")
})
