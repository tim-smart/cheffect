import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import { AiHelpers } from "@/services/AiHelpers"
import { PageFetcher } from "@/services/PageFetcher"
import { createYouTubeHandler } from "../server/youtube"

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
  handler?: ReturnType<typeof createYouTubeHandler>,
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
    const fetcher = yield* PageFetcher.make(
      "https://r.jina.ai/{url}",
      handler ? "https://cheffect.test/youtube?id={id}" : undefined,
    ).pipe(Effect.provide(FetchHttpClient.layer))
    const ai = yield* AiHelpers.make.pipe(
      Effect.provideService(LanguageModel.LanguageModel, llm),
      Effect.provideService(PageFetcher, fetcher),
    )
    return yield* ai.recipeFromUrl(url)
  }).pipe(
    Effect.provideService(FetchHttpClient.Fetch, (async (input) => {
      const url = String(input)
      fetched.push(url)
      if (handler) {
        const result = await handler(new URL(url).searchParams.get("id"))
        return new Response(result.body, result)
      }
      return new Response(html)
    }) as typeof globalThis.fetch),
    Effect.exit,
    Effect.runPromise,
  )
  return { exit, fetched, prompts }
}

test("a video's description is imported from its watch page", async () => {
  for (const url of [
    "https://youtube.com/shorts/abcdefghijk?si=Xy12",
    "https://youtu.be/abcdefghijk?si=Xy12",
    "https://m.youtube.com/watch?v=abcdefghijk&t=42s",
  ]) {
    const { exit, fetched, prompts } = await importFrom(url, video(description))
    assert.deepEqual(fetched, [
      "https://r.jina.ai/https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabcdefghijk",
    ])
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

test("API-backed video imports use the full description and fail before the model on quota exhaustion", async () => {
  const handler = createYouTubeHandler({
    apiKey: "test-key",
    fetch: async () =>
      Response.json({
        items: [
          {
            id: "abcdefghijk",
            snippet: {
              title: "Smashed potatoes",
              channelTitle: "Potato Kitchen",
              description,
              thumbnails: { high: { url: "https://i.ytimg.com/potatoes.jpg" } },
            },
          },
        ],
      }),
  })
  const result = await importFrom(
    "https://youtu.be/abcdefghijk",
    "",
    extracted,
    handler,
  )
  assert.equal(result.exit._tag, "Success")
  if (result.exit._tag !== "Success") return
  assert.equal(result.exit.value.sourceName, "Potato Kitchen")
  assert.equal(result.exit.value.imageUrl, "https://i.ytimg.com/potatoes.jpg")
  assert.match(result.prompts[0], /1kg baby potatoes/)
  assert.deepEqual(result.fetched, [
    "https://cheffect.test/youtube?id=abcdefghijk",
  ])

  const rejected = await importFrom(
    "https://youtu.be/abcdefghijk",
    "",
    extracted,
    createYouTubeHandler({
      apiKey: "test-key",
      fetch: async () =>
        Response.json(
          { error: { errors: [{ reason: "quotaExceeded" }] } },
          { status: 403 },
        ),
    }),
  )
  assert.equal(rejected.exit._tag, "Failure")
  assert.equal(rejected.prompts.length, 0)
  assert.equal(rejected.fetched.length, 1)
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
    message: "This video has no description or transcript to find a recipe in",
    askedModel: false,
  })
  assert.deepEqual(await failure(video("#crepe #gadgets #viral"), null), {
    message: "No recipe found in this video's description or transcript",
    askedModel: true,
  })
})

// The transcript comes from YouTube's player endpoint, best-effort: it adds
// to the description when it can be read and is left out when it can't.
const transcriptImport = (
  videoDescription: string,
  player: (url: URL) => Response | Promise<Response>,
) =>
  importFrom(
    "https://youtube.com/shorts/abcdefghijk",
    "",
    extracted,
    createYouTubeHandler({
      apiKey: "test-key",
      fetch: async (input) => {
        const url = new URL(String(input))
        if (url.origin === "https://www.googleapis.com") {
          return Response.json({
            items: [
              {
                id: "abcdefghijk",
                snippet: {
                  title: "Smashed potatoes",
                  channelTitle: "Potato Kitchen",
                  description: videoDescription,
                  thumbnails: {},
                },
              },
            ],
          })
        }
        return player(url)
      },
    }),
  )

test("a spoken recipe is imported from the video's transcript", async () => {
  const captions = (text: string) => ({
    events: [{ segs: [{ utf8: "[Music]" }] }, { segs: [{ utf8: text }] }],
  })
  const { exit, prompts } = await transcriptImport(
    "Crispy every time #shorts",
    (url) => {
      if (url.pathname === "/youtubei/v1/player") {
        return Response.json({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl:
                    "https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr",
                  languageCode: "en",
                  kind: "asr",
                },
                {
                  baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=de",
                  languageCode: "de",
                },
                {
                  baseUrl:
                    "https://www.youtube.com/api/timedtext?v=x&lang=en-GB",
                  languageCode: "en-GB",
                },
              ],
            },
          },
        })
      }
      assert.equal(url.searchParams.get("fmt"), "json3")
      return Response.json(
        captions(
          url.searchParams.get("lang") === "en-GB"
            ? "Take a kilo of baby potatoes and three tablespoons of olive oil"
            : "take a kilo of baby potatoes and tree table spoons",
        ),
      )
    },
  )
  assert.equal(exit._tag, "Success")
  assert.match(prompts[0], /Crispy every time/)
  assert.match(
    prompts[0],
    /Transcript:\\nTake a kilo of baby potatoes and three tablespoons of olive oil/,
  )
  assert.doesNotMatch(prompts[0], /Music/)
})

test("a video imports from its description when the transcript can't be read", async () => {
  const { exit, prompts, fetched } = await transcriptImport(description, () =>
    Response.json(
      { playabilityStatus: { status: "LOGIN_REQUIRED" } },
      { status: 403 },
    ),
  )
  assert.equal(exit._tag, "Success")
  assert.deepEqual(fetched, ["https://cheffect.test/youtube?id=abcdefghijk"])
  assert.match(prompts[0], /1kg baby potatoes/)
  assert.doesNotMatch(prompts[0], /Transcript/)
})

// An AI-dubbed video has an auto-generated track per dub, listed by language
// name, so the first one is not the spoken language.
test("a dubbed video's transcript is in its original language", async () => {
  const captionTracks =
    "bn nl en fr de iw hi id it ja ko ml pl pt pa ru es ta te uk"
      .split(" ")
      .map((lang) => ({
        baseUrl: `https://www.youtube.com/api/timedtext?v=x&lang=${lang}`,
        languageCode: lang,
        kind: "asr",
      }))
  const transcriptIn = async (
    audio: Array<unknown>,
    tracks = captionTracks,
  ) => {
    const { prompts } = await transcriptImport(description, (url) =>
      url.pathname === "/youtubei/v1/player"
        ? Response.json({
            streamingData: { adaptiveFormats: audio },
            captions: {
              playerCaptionsTracklistRenderer: { captionTracks: tracks },
            },
          })
        : Response.json({
            events: [
              { segs: [{ utf8: `Spoken ${url.searchParams.get("lang")}` }] },
            ],
          }),
    )
    return /Transcript:\\nSpoken (\w+)/.exec(prompts[0])?.[1]
  }
  assert.equal(await transcriptIn([]), "en")
  // With neither English nor an original to go by, any track still helps.
  assert.ok(
    await transcriptIn(
      [],
      captionTracks.filter((track) => track.languageCode !== "en"),
    ),
  )
  assert.equal(
    await transcriptIn([
      { audioTrack: { id: "en-US.3", displayName: "English (US)" } },
      { audioTrack: { id: "es.4", displayName: "Spanish original" } },
    ]),
    "es",
  )
})
