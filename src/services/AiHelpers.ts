import { ExtractedRecipe } from "@/domain/Recipe"
import { LanguageModel } from "@effect/ai"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { CorsProxy } from "./CorsProxy"
import {
  encodeGroceryItemListXml,
  GroceryItem,
  GroceryItemList,
} from "@/domain/GroceryItem"
import * as DateTime from "effect/DateTime"
import { Atom } from "@effect-atom/atom-react"
import { openAiApiKey } from "@/Settings"

export const openAiClientLayer = Atom.make((get) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const apiKeyOption = yield* get.result(openAiApiKey.atom)
      if (apiKeyOption._tag === "None") {
        return yield* Effect.never
      }
      const apiKey = apiKeyOption.value
      return OpenAiClient.layer({ apiKey }).pipe(
        Layer.provide(FetchHttpClient.layer),
      )
    }),
  ),
)

export class AiHelpers extends Effect.Service<AiHelpers>()("AiHelpers", {
  dependencies: [CorsProxy.Default],
  scoped: Effect.gen(function* () {
    const model = yield* OpenAiLanguageModel.model("gpt-5-mini")
    const groceryModel = yield* OpenAiLanguageModel.model("o4-mini", {
      reasoning: {
        effort: "low",
      },
    })
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
              content: `You are an AI assistant that creates a clean grocery list from messy input.

You will receive a list of recipe ingredients in XML format. Your task is to clean up the item names, merge similar items, and categorize them into aisles.

- only keep the item name, remove any adjectives and cooking instructions
  - "1 cup chopped fresh parsley" becomes "1 cup parsley"
  - "2 large eggs, beaten" becomes "2 eggs"
- merging similar items, simlifying names and merging quantities:
  - "tomato sauce" and "tomato sauce, organic" becomes "tomato sauce"
  - "2 eggs" and "1 egg" becomes one item "3 eggs"
  - "1 cup milk" and "250ml milk" becomes one item "1.25 cups milk"
  - "2 crushed garlic cloves" and "1 garlic clove, minced" becomes one item "3 garlic cloves"
  - "1 plump garlic cloves" becomes one item "1 garlic clove"
- you **MUST NOT** miss any item quantities when merging
- keep "optional" items, but add "(optional)" to the item name
- you *MUST* categorize items into aisles
- if multiple items are merged, only use the id of the first item

Here is the list of items as XML:

${encodeGroceryItemListXml(leftoverItems.values())}
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
