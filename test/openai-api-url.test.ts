import { test } from "node:test"
import * as assert from "node:assert/strict"
import { OpenAiClient } from "@effect/ai-openai"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { EventLogClient, eventLogAtom, writeEvent } from "@/EventLog"
import { openAiClientLayer } from "@/services/AiHelpers"
import { openAiApiUrl } from "@/Settings"
import { SettingEvent } from "@/Settings/Events"
import { layerCheffect } from "./harness/cheffect"

const setSetting = (id: string, value: string) =>
  writeEvent(
    SettingEvent.set({
      id,
      value: JSON.stringify({ _tag: "Some", value }),
    }),
  )

// Returns the URL the OpenAI client sends a Responses API request to.
const requestUrl = async (
  settings: Record<string, string>,
): Promise<string> => {
  const urls: Array<string> = []
  const fetch = async (input: Request | URL | string) => {
    urls.push(input instanceof Request ? input.url : input.toString())
    return Response.json({})
  }
  const registry = AtomRegistry.make({
    initialValues: [
      [
        eventLogAtom.layer,
        EventLogClient.layer.pipe(Layer.provideMerge(layerCheffect)),
      ],
    ],
  })
  registry.mount(eventLogAtom)
  try {
    await Effect.gen(function* () {
      yield* Atom.getResult(eventLogAtom).pipe(
        Effect.flatMap((context) =>
          Effect.forEach(Object.entries(settings), ([id, value]) =>
            setSetting(id, value),
          ).pipe(Effect.provideContext(context)),
        ),
      )
      // Settings load after they are written, so the layer sees them.
      yield* Atom.getResult(openAiApiUrl.atom)
      const client = yield* OpenAiClient.OpenAiClient.pipe(
        Effect.provide(registry.get(openAiClientLayer)),
      )
      yield* client.client
        .post("/responses")
        .pipe(
          Effect.provideService(
            FetchHttpClient.Fetch,
            fetch as typeof globalThis.fetch,
          ),
        )
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.provideService(AtomRegistry.AtomRegistry, registry),
      Effect.runPromise,
    )
  } finally {
    registry.dispose()
  }
  return urls[0]!
}

test("OpenAI requests go to the official API by default", async () => {
  assert.equal(
    await requestUrl({ openAiApiKey: "test-api-key" }),
    "https://api.openai.com/v1/responses",
  )
})

test("OpenAI requests go to a custom OpenAI-compatible API URL", async () => {
  assert.equal(
    await requestUrl({
      openAiApiKey: "test-api-key",
      openAiApiUrl: "https://llm.example.com/api/v1",
    }),
    "https://llm.example.com/api/v1/responses",
  )
})
