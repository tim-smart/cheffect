import { ExtractedRecipe } from "@/domain/Recipe"
import { Rx } from "@effect-rx/rx-react"
import { AiLanguageModel } from "@effect/ai"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("VITE_OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer))

export class AiHelpers extends Effect.Service<AiHelpers>()("AiHelpers", {
  dependencies: [OpenAiClientLayer],
  scoped: Effect.gen(function* () {
    const model = yield* OpenAiLanguageModel.model("o4-mini")

    const recipeFromUrl = Effect.fn("AiHelpers.recipeFromUrl")(function* (
      url: string,
    ) {
      const llm = yield* AiLanguageModel.AiLanguageModel
      yield* Effect.annotateCurrentSpan({ url })
      const response = yield* llm.generateObject({
        prompt: `Extract a recipe from the following URL: ${url}`,
        schema: ExtractedRecipe,
      })
      return response.value
    }, Effect.provide(model))

    return { recipeFromUrl } as const
  }),
}) {}

export const runtimeRx = Rx.runtime(AiHelpers.Default)

export const createRecipeRx = runtimeRx.fn(
  Effect.fn(function* (url: string) {
    const ai = yield* AiHelpers
    const extractedRecipe = yield* ai.recipeFromUrl(url)
    yield* Effect.log(extractedRecipe)
  }),
)
