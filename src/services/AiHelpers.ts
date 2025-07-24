import { ExtractedRecipe } from "@/domain/Recipe"
import { AiLanguageModel } from "@effect/ai"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { CorsProxy } from "./CorsProxy"

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("VITE_OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer))

export class AiHelpers extends Effect.Service<AiHelpers>()("AiHelpers", {
  dependencies: [OpenAiClientLayer, CorsProxy.Default],
  scoped: Effect.gen(function* () {
    const model = yield* OpenAiLanguageModel.model("gpt-4.1-mini")
    const proxy = yield* CorsProxy

    const recipeFromUrl = Effect.fn("AiHelpers.recipeFromUrl")(function* (
      url: string,
    ) {
      const llm = yield* AiLanguageModel.AiLanguageModel
      yield* Effect.annotateCurrentSpan({ url })
      const html = yield* proxy.htmlStripped(url)
      const response = yield* llm.generateObject({
        system: "Extract a recipe from the provided HTML.",
        prompt: html,
        schema: ExtractedRecipe,
      })
      yield* Effect.log(response.value)
      return response.value
    }, Effect.provide(model))

    return { recipeFromUrl } as const
  }),
}) {}
