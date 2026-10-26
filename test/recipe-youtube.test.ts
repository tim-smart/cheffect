import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as Effect from "effect/Effect"
import { AiHelpers } from "@/services/AiHelpers"
import { PageFetcher } from "@/services/PageFetcher"

// A YouTube link imports from the video's description, read from the player
// response in the watch page. A page YouTube won't serve, a missing
// description, or a description without a recipe fails instead of reaching a
// model that would invent one.

const description = `Crispy smashed potatoes

Ingredients:
1kg baby potatoes
3 tbsp olive oil

Boil, smash, roast at 220C for 30 minutes.`

// The mobile site's shape: a null assignment first, then the real one, with
// more script after it and visible text that is only the footer.
const watchPage = (playerResponse: unknown) =>
  `<html><head><title> - YouTube</title></head><body>
<script>var ytInitialPlayerResponse = null;</script>
<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};var meta = document.createElement('meta');</script>
<footer>About Press Copyright © 2026 Google LLC</footer>
</body></html>`

const video = (shortDescription: string) =>
  watchPage({
    playabilityStatus: { status: "OK" },
    videoDetails: {
      videoId: "abcdefghijk",
      title: "Smashed potatoes {the crispy way}",
      author: "Potato Kitchen",
      shortDescription,
      thumbnail: {
        thumbnails: [
          {
            url: "https://i.ytimg.com/vi/abcdefghijk/default.jpg",
            width: 120,
            height: 90,
          },
          {
            url: "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg",
            width: 1920,
            height: 1080,
          },
          {
            url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
            width: 480,
            height: 360,
          },
        ],
      },
    },
  })

const extracted = {
  title: "Crispy smashed potatoes",
  imageUrl: null,
  prepTime: null,
  cookingTime: 30,
  servings: null,
  ingredients: [
    {
      name: "Main",
      ingredients: [
        { name: "baby potatoes", quantity: 1, unit: "kg" },
        { name: "olive oil", quantity: 3, unit: "tbsp" },
      ],
    },
  ],
  steps: [{ text: "Boil, smash, roast at 220C for 30 minutes.", tips: [] }],
  sourceName: "YouTube",
}

const importFrom = async (
  url: string,
  html: string,
  recipe: unknown = extracted,
) => {
  const fetched: Array<string> = []
  const prompts: Array<string> = []
  const exit = await Effect.gen(function* () {
    const llm = yield* LanguageModel.make({
      generateText: (options) => {
        prompts.push(JSON.stringify(options.prompt))
        return Effect.succeed([
          { type: "text", text: JSON.stringify({ recipe }) },
        ])
      },
      streamText: () => {
        throw new Error("not used")
      },
    })
    const ai = yield* AiHelpers.make.pipe(
      Effect.provideService(LanguageModel.LanguageModel, llm),
      Effect.provideService(PageFetcher, {
        html: (url) => {
          fetched.push(url)
          return Effect.succeed(html)
        },
      }),
    )
    return yield* ai.recipeFromUrl(url)
  }).pipe(Effect.exit, Effect.runPromise)
  return { exit, fetched, prompts }
}

test("a video's description is imported from its watch page", async () => {
  for (const url of [
    "https://youtube.com/shorts/abcdefghijk?si=Xy12",
    "https://youtu.be/abcdefghijk?si=Xy12",
    "https://m.youtube.com/watch?v=abcdefghijk&t=42s",
  ]) {
    const { exit, fetched, prompts } = await importFrom(url, video(description))
    assert.deepEqual(fetched, ["https://www.youtube.com/watch?v=abcdefghijk"])
    assert.equal(exit._tag, "Success", url)
    if (exit._tag !== "Success") return
    assert.equal(exit.value.title, "Crispy smashed potatoes")
    assert.equal(
      exit.value.imageUrl,
      "https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg",
    )
    assert.equal(exit.value.sourceName, "Potato Kitchen")
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /1kg baby potatoes/)
    assert.match(prompts[0], /Channel: Potato Kitchen/)
    assert.doesNotMatch(prompts[0], /Google LLC/)
  }
})

const failure = async (html: string, recipe?: unknown) => {
  const { exit, prompts } = await importFrom(
    "https://www.youtube.com/watch?v=abcdefghijk",
    html,
    recipe,
  )
  assert.equal(exit._tag, "Failure")
  const error = exit._tag === "Failure" ? exit.cause.reasons[0] : undefined
  return {
    message: error?._tag === "Fail" ? (error.error as Error).message : error,
    askedModel: prompts.length > 0,
  }
}

test("a video with no recipe to read fails without one being invented", async () => {
  assert.deepEqual(
    await failure(
      watchPage({
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm you’re not a bot",
        },
      }),
    ),
    {
      message:
        "YouTube did not return the video: Sign in to confirm you’re not a bot",
      askedModel: false,
    },
  )
  assert.deepEqual(await failure("<html><body>Consent</body></html>"), {
    message: "YouTube's page did not include the video",
    askedModel: false,
  })
  assert.deepEqual(await failure(video("  ")), {
    message: "This video has no description to find a recipe in",
    askedModel: false,
  })
  assert.deepEqual(await failure(video("#crepe #gadgets #viral"), null), {
    message: "No recipe found in this video's description",
    askedModel: true,
  })
})
