import { ExtractedRecipe, Recipe } from "@/domain/Recipe"
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
import { Atom, Result } from "@effect-atom/atom-react"
import { openAiApiKey } from "@/Settings"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as HttpClient from "@effect/platform/HttpClient"
import * as Schedule from "effect/Schedule"
import { constTrue } from "effect/Function"
import * as Prompt from "@effect/ai/Prompt"
import * as Schema from "effect/Schema"

export const isAiEnabledResultAtom = Atom.make((get) =>
  Result.map(get(openAiApiKey.atom), Option.isSome),
)
export const isAiEnabledAtom = Atom.make((get) =>
  get(openAiApiKey.atom).pipe(
    Result.map(Option.isSome),
    Result.getOrElse(constTrue),
  ),
)

export const openAiClientLayer = Atom.make((get) => {
  const apiKeyOption = Result.value(get(openAiApiKey.atom)).pipe(Option.flatten)
  if (Option.isNone(apiKeyOption)) {
    return Layer.effect(OpenAiClient.OpenAiClient, Effect.never)
  }
  return OpenAiClient.layer({
    apiKey: apiKeyOption.value,
    transformClient: HttpClient.retryTransient({
      schedule: Schedule.exponential(500, 1.5).pipe(
        Schedule.union(Schedule.spaced(10_000)),
      ),
    }),
  }).pipe(Layer.provide(FetchHttpClient.layer))
})

export class AiHelpers extends Effect.Service<AiHelpers>()("AiHelpers", {
  dependencies: [CorsProxy.Default],
  scoped: Effect.gen(function* () {
    const model = yield* OpenAiLanguageModel.model("gpt-5-mini", {
      reasoning: {
        effort: "medium",
      },
    })
    const groceryModel = yield* OpenAiLanguageModel.model("gpt-4.1")
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

    const recipesFromImages = Effect.fn("AiHelpers.recipeFromImages")(
      function* (fileList: FileList) {
        const llm = yield* LanguageModel.LanguageModel
        const parts = yield* Effect.forEach(
          fileList,
          Effect.fnUntraced(function* (file) {
            const data = yield* Effect.promise(() => file.arrayBuffer())
            return Prompt.filePart({
              mediaType: file.type,
              fileName: file.name,
              data: new Uint8Array(data),
            })
          }),
        )
        const response = yield* llm.generateObject({
          prompt: [
            {
              role: "system",
              content: "Extract any recipes from the provided images.",
            },
            {
              role: "user",
              content: parts,
            },
          ],
          schema: Schema.Struct({
            recipes: Schema.Array(ExtractedRecipe),
          }),
        })
        yield* Effect.log(response.value)
        return response.value.recipes
      },
      Effect.provide(model),
    )

    const convertIngredients = Effect.fn("AiHelpers.convertIngredients")(
      function* (recipe: Recipe, country: string) {
        const llm = yield* LanguageModel.LanguageModel
        const response = yield* llm.generateObject({
          prompt: [
            {
              role: "system",
              content:
                "You will be provided a recipe in XML format. Convert any quantities and units to be appropriate for the following country: " +
                country,
            },
            { role: "user", content: [{ type: "text", text: recipe.toXml() }] },
          ],
          schema: ExtractedRecipe,
        })
        return response.value
      },
      Effect.provide(model),
    )

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
              content: `You are an AI assistant that converts a list of ingredients into a clean grocery list.

You will receive a list of ingredients from a recipe in XML format. Your task is to clean up the item names, merge similar items, and categorize them into aisles.

- only keep the item name, remove any adjectives and cooking instructions
  - "1 cup chopped fresh parsley" becomes "1 cup parsley"
  - "2 large eggs, beaten" becomes "2 eggs"
- merging similar items, simlifying names and merging quantities:
  - "tomato sauce" and "tomato sauce, organic" becomes "tomato sauce"
  - "2 eggs" and "1 egg" becomes one item "3 eggs"
  - "1 cup milk" and "250ml milk" becomes one item "1.25 cups milk"
  - "2 crushed garlic cloves" and "1 garlic clove, minced" becomes one item "3 garlic cloves"
  - "1 plump garlic cloves" becomes one item "1 garlic clove"
- avoid removing useful information from names, such as "low-fat", "gluten-free", "large", "ripe", etc.
  - "superfood pick n mix" stays as "superfood pick n mix"
- you **MUST NOT** miss any item quantities when merging
- only include item quantities in the dedicated quantity field, not in the name
- keep "optional" items, but add "(optional)" to the item name
- you *MUST* categorize items into aisles
- if multiple items are merged, only use the id of the first item

Here is the list of items as XML:

\`\`\`xml
${encodeGroceryItemListXml(leftoverItems.values())}
\`\`\`
`,
            },
          ],
          schema: GroceryItemList,
        })

        const merges = new Map<string, string>()
        const updated: Array<GroceryItem> = []
        for (const item of response.value.items) {
          const prev = leftoverItems.get(item.id)
          if (!prev) continue
          const recipeIds = new Set(
            prev.recipeIds ? prev.recipeIds.slice() : [],
          )
          leftoverItems.delete(item.id)
          for (const mergedId of item.mergedIds) {
            const mergedItem = leftoverItems.get(mergedId)
            if (mergedItem) {
              merges.set(mergedId, item.id)
            }
            if (!mergedItem || !mergedItem.recipeIds) continue
            mergedItem.recipeIds.forEach((id) => recipeIds.add(id))
          }
          const recipeIdsArray = Array.fromIterable(recipeIds)
          updated.push(
            new GroceryItem({
              ...prev,
              ...item,
              recipeIds: Array.isNonEmptyArray(recipeIdsArray)
                ? recipeIdsArray
                : null,
              updatedAt: DateTime.unsafeNow(),
            }),
          )
        }

        const removed = Array.fromIterable(leftoverItems.values())

        return { updated, removed, merges } as const
      },
      Effect.provide(groceryModel),
    )

    return {
      recipeFromUrl,
      recipesFromImages,
      beautifyGroceries,
      convertIngredients,
    } as const
  }),
}) {
  static runtime = Atom.runtime((get) =>
    AiHelpers.Default.pipe(Layer.provideMerge(get(openAiClientLayer))),
  )
}
