import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

// YouTube watch and Shorts pages have no Recipe JSON-LD, and their HTML is a
// script shell whose visible text is the footer. What a recipe import can use
// is the player response every page embeds as `ytInitialPlayerResponse`: its
// `videoDetails` carry the title, channel, full description and thumbnails.

export interface YouTubeVideo {
  readonly title: string | null
  readonly channel: string | null
  readonly description: string | null
  readonly thumbnail: string | null
}

// A page without `videoDetails` is one YouTube refused to serve, usually with
// a reason such as "Sign in to confirm you're not a bot".
export const YouTubePage = Schema.Union([
  Schema.TaggedStruct("Video", {
    video: Schema.Struct({
      title: Schema.NullOr(Schema.String),
      channel: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      thumbnail: Schema.NullOr(Schema.String),
    }),
  }),
  Schema.TaggedStruct("Unavailable", {
    reason: Schema.NullOr(Schema.String),
  }),
])
export type YouTubePage = typeof YouTubePage.Type

const youTubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
])

const videoIdPattern = /^[\w-]{11}$/
export const isYouTubeVideoId = (id: string): boolean => videoIdPattern.test(id)

// The video id of a YouTube watch, Shorts, live or embed link, or a youtu.be
// share link, or null for any other URL.
export const youTubeVideoId = (input: string): string | null => {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.toLowerCase()
  const id =
    host === "youtu.be"
      ? url.pathname.split("/")[1]
      : !youTubeHosts.has(host)
        ? undefined
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : /^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)?.[1]
  return id !== undefined && id !== null && videoIdPattern.test(id) ? id : null
}

// Shorts and share links all open the same watch page, which is the smaller
// of the two pages for a Short.
export const youTubeWatchUrl = (id: string): string =>
  `https://www.youtube.com/watch?v=${id}`

const PlayerResponse = Schema.Struct({
  playabilityStatus: Schema.optional(
    Schema.Struct({ reason: Schema.optional(Schema.String) }),
  ),
  videoDetails: Schema.optional(
    Schema.Struct({
      title: Schema.optional(Schema.String),
      author: Schema.optional(Schema.String),
      shortDescription: Schema.optional(Schema.String),
      thumbnail: Schema.optional(
        Schema.Struct({
          thumbnails: Schema.Array(
            Schema.Struct({
              url: Schema.String,
              width: Schema.Finite,
              height: Schema.Finite,
            }),
          ),
        }),
      ),
    }),
  ),
})

const decodePlayerResponse = Schema.decodeUnknownOption(
  Schema.fromJsonString(PlayerResponse),
)

// The JSON object that starts at `start`, found by matching braces outside
// strings. The script carries more code after it, so it can't be parsed whole.
const objectAt = (text: string, start: number): string | null => {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === "\\") i++
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
    } else if (c === "{") {
      depth++
    } else if (c === "}" && --depth === 0) {
      return text.slice(start, i + 1)
    }
  }
  return null
}

const nonEmpty = (s: string | undefined): string | null => {
  const trimmed = s?.trim()
  return trimmed === undefined || trimmed === "" ? null : trimmed
}

// The mobile site assigns `ytInitialPlayerResponse = null` before the real
// one, so only an assignment of an object counts.
export const findYouTubeVideo = (html: string): YouTubePage => {
  for (const match of html.matchAll(/ytInitialPlayerResponse\s*=\s*\{/g)) {
    const json = objectAt(html, match.index + match[0].length - 1)
    if (json === null) continue
    const response = decodePlayerResponse(json)
    if (Option.isNone(response)) continue
    const details = response.value.videoDetails
    if (details === undefined) {
      return {
        _tag: "Unavailable",
        reason: nonEmpty(response.value.playabilityStatus?.reason),
      }
    }
    const largest = details.thumbnail?.thumbnails.reduce(
      (best, t) => (t.width * t.height > best.width * best.height ? t : best),
      { url: "", width: 0, height: 0 },
    )
    return {
      _tag: "Video",
      video: {
        title: nonEmpty(details.title),
        channel: nonEmpty(details.author),
        description: nonEmpty(details.shortDescription),
        thumbnail: nonEmpty(largest?.url),
      },
    }
  }
  return { _tag: "Unavailable", reason: null }
}
