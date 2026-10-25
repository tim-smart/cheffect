import { ExtractedRecipe, Recipe } from "@/domain/Recipe"
import * as LanguageModel from "effect/ai/LanguageModel"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { CorsProxy } from "./CorsProxy"
import {
  findRecipeJsonLd,
  type PageText,
  pageText,
} from "@/Recipes/extractFromHtml"
import { beautifyChanges } from "@/Groceries/beautify"
import {
  encodeGroceryItemListXml,
  GroceryItem,
  GroceryListChanges,
} from "@/domain/GroceryItem"
import * as DateTime from "effect/DateTime"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { openAiApiKey, openAiApiUrl, openAiModel } from "@/Settings"
import * as Option from "effect/Option"
import * as HttpClient from "effect/http/HttpClient"
import * as Schedule from "effect/Schedule"
import { constTrue } from "effect/Function"
import * as Prompt from "effect/ai/Prompt"
import * as Schema from "effect/Schema"

export const isAiEnabledResultAtom = Atom.make((get) =>
  AsyncResult.map(get(openAiApiKey.atom), Option.isSome),
)
export const isAiEnabledAtom = Atom.make((get) =>
  get(openAiApiKey.atom).pipe(
    AsyncResult.map(Option.isSome),
    AsyncResult.getOrElse(constTrue),
  ),
)

export const openAiClientLayer = Atom.make((get) => {
  const apiKeyOption = AsyncResult.value(get(openAiApiKey.atom)).pipe(
    Option.flatten,
  )
  const modelOption = AsyncResult.value(get(openAiModel.atom)).pipe(
    Option.flatten,
  )
  const apiUrl = AsyncResult.value(get(openAiApiUrl.atom)).pipe(
    Option.flatten,
    Option.getOrUndefined,
  )
  if (Option.isNone(apiKeyOption) || Option.isNone(modelOption)) {
    return Layer.effect(OpenAiClient.OpenAiClient, Effect.never).pipe(
      Layer.merge(Layer.effect(LanguageModel.LanguageModel, Effect.never)),
    )
  }
  return OpenAiLanguageModel.model(modelOption.value, {
    reasoning: { effort: "medium" },
  }).pipe(
    Layer.provideMerge(
      OpenAiClient.layer({
        apiKey: apiKeyOption.value,
        apiUrl,
        transformClient: HttpClient.retryTransient({
          schedule: Schedule.min([
            Schedule.exponential(500, 1.5),
            Schedule.spaced(10_000),
          ]),
        }),
      }).pipe(Layer.provide(FetchHttpClient.layer)),
    ),
  )
})

const jsonLdPrompt = `Convert the provided schema.org Recipe, given as JSON, into the recipe format.

- Split each ingredient line into quantity, unit and name. Leave the unit null rather than guess one the line does not state.
- Group ingredients into components when the lines include headings, otherwise use a single component.
- Convert durations such as "PT1H20M" to minutes.
- Move notes and tips out of step text into the step's tips.`

const partialJsonLdPrompt = `Extract a recipe from the provided schema.org Recipe JSON and the text of the web page it came from.

The JSON is authoritative. Use the page text only for what the JSON is missing.

- Split each ingredient line into quantity, unit and name. Leave the unit null rather than guess one the line does not state.
- Group ingredients into components when the recipe has headings, otherwise use a single component.
- Convert durations such as "PT1H20M" to minutes.`

const pageTextPrompt = "Extract a recipe from the provided web page text."

const formatPageText = (page: PageText): string =>
  [
    page.title === null ? null : `Title: ${page.title}`,
    page.image === null ? null : `Image: ${page.image}`,
    "",
    page.text,
  ]
    .filter((line) => line !== null)
    .join("\n")

export class AiHelpers extends Context.Service<AiHelpers>()("AiHelpers", {
  make: Effect.gen(function* () {
    const llm = yield* LanguageModel.LanguageModel
    const proxy = yield* CorsProxy

    const recipeFromUrl = Effect.fn("AiHelpers.recipeFromUrl")(function* (
      url: string,
    ) {
      yield* Effect.annotateCurrentSpan({ url })
      const html = yield* proxy.html(url)
      const jsonLd = findRecipeJsonLd(html, url)
      const hasIngredients = (jsonLd?.ingredients.length ?? 0) > 0
      const hasInstructions = (jsonLd?.instructions.length ?? 0) > 0
      // Complete JSON-LD is sent alone. With half of it, the page text fills
      // the gaps. A Recipe block with neither is no help at all.
      const page =
        hasIngredients && hasInstructions ? null : pageText(html, url)
      const [system, text] =
        page === null
          ? [jsonLdPrompt, JSON.stringify(jsonLd)]
          : hasIngredients || hasInstructions
            ? [
                partialJsonLdPrompt,
                `JSON-LD:\n${JSON.stringify(jsonLd)}\n\nPage text:\n${page.text}`,
              ]
            : [pageTextPrompt, formatPageText(page)]
      const response = yield* llm.generateObject({
        prompt: [
          { role: "system", content: system },
          { role: "user", content: [{ type: "text", text }] },
        ],
        schema: ExtractedRecipe,
      })
      yield* Effect.log(response.value)
      // Taken from the page itself when it has them, rather than trusting the
      // model to copy a URL.
      return new ExtractedRecipe({
        ...response.value,
        imageUrl: jsonLd?.image ?? page?.image ?? response.value.imageUrl,
        sourceName: jsonLd?.siteName ?? response.value.sourceName,
      })
    })

    const recipesFromImages = Effect.fn("AiHelpers.recipeFromImages")(
      function* (fileList: FileList) {
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
    )

    const convertIngredients = Effect.fn("AiHelpers.convertIngredients")(
      function* (recipe: Recipe, country: string) {
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
    )

    const beautifyGroceries = Effect.fn("AiHelpers.beautifyGroceries")(
      function* (groceries: ReadonlyArray<GroceryItem>) {
        const items = groceries.filter((item) => !item.completed)

        const response = yield* llm.generateObject({
          prompt: [
            {
              role: "system",
              content: `You are an AI assistant that tidies a grocery list.

You will receive the items on a grocery list in XML format. Clean up the item names, merge items that are the same thing, and put items without an aisle into one. Return only what changes: an item you don't mention stays exactly as it is, so never repeat an item that doesn't change.

- updates: an item whose name or quantity changes
  - only keep the item name, remove any adjectives and cooking instructions
    - "chopped fresh parsley" becomes "parsley"
    - "large eggs, beaten" becomes "eggs"
    - "plump garlic cloves" becomes "garlic clove"
  - keep useful information in names, such as "low-fat", "gluten-free", "large", "ripe", etc.
    - "superfood pick n mix" stays as "superfood pick n mix"
  - quantities go only in the quantity field, never in the name
  - keep "optional" items, but add "(optional)" to the item name
- merges: items that are the same thing, merged into one
  - the target keeps its id and takes the merged name and the combined quantity; the sources are removed
  - "tomato sauce" and "tomato sauce, organic" become "tomato sauce"
  - "2 eggs" and "1 egg" become "3 eggs"
  - "1 cup milk" and "250ml milk" become "1.25 cups milk"
  - "2 crushed garlic cloves" and "1 garlic clove, minced" become "3 garlic cloves"
  - you **MUST NOT** lose any quantity when merging
- aisles: an aisle for each item that has none; never change an aisle an item already has

Here is the list of items as XML:

\`\`\`xml
${encodeGroceryItemListXml(items)}
\`\`\`
`,
            },
          ],
          schema: GroceryListChanges,
        })

        return beautifyChanges(items, response.value, yield* DateTime.now)
      },
    )

    return {
      recipeFromUrl,
      recipesFromImages,
      beautifyGroceries,
      convertIngredients,
    } as const
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(CorsProxy.layer),
  )

  static runtime = Atom.runtime((get) =>
    AiHelpers.layer.pipe(Layer.provideMerge(get(openAiClientLayer))),
  )
}
