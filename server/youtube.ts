import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  findYouTubeVideo,
  isYouTubeVideoId,
  youTubeWatchUrl,
  type YouTubePage,
} from "../src/Recipes/youtube.js"
import { fetchPage, type FetchResponse } from "./fetchGuard.js"

const Snippets = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      snippet: Schema.Struct({
        title: Schema.String,
        channelTitle: Schema.String,
        description: Schema.String,
        thumbnails: Schema.Record(
          Schema.String,
          Schema.Struct({
            url: Schema.String,
            width: Schema.optional(Schema.Finite),
            height: Schema.optional(Schema.Finite),
          }),
        ),
      }),
    }),
  ),
})
const ApiError = Schema.Struct({
  error: Schema.Struct({
    errors: Schema.optional(
      Schema.Array(Schema.Struct({ reason: Schema.String })),
    ),
  }),
})
const unavailable = (reason: string): YouTubePage => ({
  _tag: "Unavailable",
  reason,
})
const reply = (page: YouTubePage, status = 200): FetchResponse => ({
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
  body: JSON.stringify(page),
})

// Keys stay on the server. Only public video snippets are read; no cookies,
// private videos, transcripts, or player/bot-check workarounds are involved.
export const createYouTubeHandler = (
  options: {
    readonly apiKey?: string
    readonly fetch?: typeof globalThis.fetch
    readonly now?: () => number
  } = {},
) => {
  const apiKey = options.apiKey?.trim()
  const fetch = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const cache = new Map<string, { expires: number; page: YouTubePage }>()
  const pending = new Map<string, Promise<FetchResponse>>()

  const result = (page: YouTubePage, status = 200) => ({ page, status })

  const load = async (
    id: string,
  ): Promise<{ page: YouTubePage; status: number }> => {
    if (!apiKey) {
      const page = await fetchPage(youTubeWatchUrl(id))
      return page.status >= 200 && page.status < 300
        ? result(findYouTubeVideo(page.body))
        : result(
            unavailable(
              "YouTube blocked the page request. Ask the server operator to configure YOUTUBE_API_KEY for public video imports.",
            ),
            502,
          )
    }
    const url = new URL("https://www.googleapis.com/youtube/v3/videos")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("id", id)
    url.searchParams.set(
      "fields",
      "items(id,snippet(title,channelTitle,description,thumbnails))",
    )
    const response = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    })
    const json: unknown = await response.json()
    if (!response.ok) {
      const error = Schema.decodeUnknownOption(ApiError)(json)
      const quota =
        Option.isSome(error) &&
        error.value.error.errors?.some(({ reason }) =>
          ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(
            reason,
          ),
        )
      return result(
        unavailable(
          quota || response.status === 429
            ? "The YouTube API quota or rate limit has been reached. Try later or ask the server operator to check the quota."
            : response.status >= 500
              ? "The YouTube API is temporarily unavailable. Try again later."
              : "The YouTube API key or configuration was rejected. Ask the server operator to check YOUTUBE_API_KEY and enable YouTube Data API v3.",
        ),
        response.status >= 500 ? 502 : 403,
      )
    }
    const decoded = Schema.decodeUnknownOption(Snippets)(json)
    if (Option.isNone(decoded)) {
      return result(
        unavailable(
          "YouTube returned invalid video metadata. Try again later.",
        ),
        502,
      )
    }
    const item = decoded.value.items.find((item) => item.id === id)
    if (!item)
      return result(
        unavailable(
          "This video is private, deleted, or unavailable through the YouTube API.",
        ),
        404,
      )
    const { snippet } = item
    const thumbnail =
      Object.values(snippet.thumbnails).sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
      )[0]?.url ?? null
    return result({
      _tag: "Video",
      video: {
        title: snippet.title.trim() || null,
        channel: snippet.channelTitle.trim() || null,
        description: snippet.description.trim() || null,
        thumbnail,
      },
    })
  }

  return async (id: string | null): Promise<FetchResponse> => {
    if (id === null || !isYouTubeVideoId(id)) {
      return reply(unavailable("A valid YouTube video id is required"), 400)
    }
    const cached = cache.get(id)
    if (cached && cached.expires > now()) return reply(cached.page)
    cache.delete(id)
    const active = pending.get(id)
    if (active) return active
    if (pending.size >= 256)
      return reply(unavailable("Video imports are busy. Try again later."), 503)
    const request = load(id)
      .then((result) => {
        const { page, status } = result
        if (page._tag === "Video") {
          if (cache.size >= 256) cache.delete(cache.keys().next().value!)
          cache.set(id, { expires: now() + 5 * 60_000, page })
        }
        return reply(page, status)
      })
      .catch(() =>
        reply(
          unavailable(
            "YouTube could not be reached or did not return valid metadata. Try again later. Server operators can configure YOUTUBE_API_KEY for public video imports.",
          ),
          502,
        ),
      )
      .finally(() => pending.delete(id))
    pending.set(id, request)
    return request
  }
}
