import { ExtractedRecipe } from "@/domain/Recipe"
import { LanguageModel } from "@effect/ai"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { CorsProxy } from "./CorsProxy"
import {
  encodeGroceryItemListXml,
  GroceryItem,
  GroceryItemList,
} from "@/domain/GroceryItem"
import * as DateTime from "effect/DateTime"

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("VITE_OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer))

export class AiHelpers extends Effect.Service<AiHelpers>()("AiHelpers", {
  dependencies: [OpenAiClientLayer, CorsProxy.Default],
  scoped: Effect.gen(function* () {
    const model = yield* OpenAiLanguageModel.model("gpt-5-mini")
    const groceryModel = yield* OpenAiLanguageModel.model("gpt-5-nano")
    const proxy = yield* CorsProxy

    const recipeFromUrl = Effect.fn("AiHelpers.recipeFromUrl")(function* (
      url: string,
    ) {
      const llm = yield* LanguageModel.LanguageModel
      yield* Effect.annotateCurrentSpan({ url })
      const html = yield* proxy.htmlStripped(url)
      const response = yield* llm.generateObject({
        prompt: [
          {
            role: "system",
            content: "Extract a recipe from the provided HTML.",
          },
          { role: "user", content: [{ type: "text", text: html }] },
        ],
        schema: ExtractedRecipe,
      })
      yield* Effect.log(response.value)
      return response.value
    }, Effect.provide(model))

    const beautifyGroceries = Effect.fn("AiHelpers.beautifyGroceries")(
      function* (groceries: ReadonlyArray<GroceryItem>) {
        const llm = yield* LanguageModel.LanguageModel
        const leftoverItems = new Map<string, GroceryItem>()

        for (const item of groceries) {
          if (item.completed) continue
          leftoverItems.set(item.id, item)
        }

        const response = yield* llm.generateObject({
          prompt: [
            {
              role: "system",
              content: `You are an AI assistant that cleans up a list of grocery items by:

- merging duplicate items (similar names, different quantities)
- standardizing item names (e.g., "tomato sauce" and "tomato paste" should be distinct items)
- ensuring quantities are clear and consistent
- when merging quantities, do not show the calculation, just the final quantity (e.g., "1 tbsp + 3 tsp" becomes "2 tbsp")
- categorizing items into aisles
- id's should be preseved from the original list. If multiple items are merged, use the id of the first item.

Here is the list of items in an XML format:

${encodeGroceryItemListXml(Array.from(leftoverItems.values()))}
`,
            },
          ],
          schema: GroceryItemList,
        })

        const updated: Array<GroceryItem> = []
        for (const item of response.value.items) {
          const prev = leftoverItems.get(item.id)
          if (!prev) continue
          leftoverItems.delete(item.id)
          updated.push(
            new GroceryItem({
              ...prev,
              ...item,
              updatedAt: DateTime.unsafeNow(),
            }),
          )
        }

        const removed = Array.from(leftoverItems.values())

        return { updated, removed } as const
      },
      Effect.provide(groceryModel),
    )

    return { recipeFromUrl, beautifyGroceries } as const
  }),
}) {}
