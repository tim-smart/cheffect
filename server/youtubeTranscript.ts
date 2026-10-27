import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

// Best-effort, unofficial transcripts for video imports. The Data API only
// lets a video's owner download captions, and the caption URLs in the watch
// page now need a PO token. What still works (checked 2026-10-27) is asking
// InnerTube's player endpoint as the Android app: its caption URLs can be read
// without one. YouTube changes this without notice and bot-checks most
// requests from datacenter IPs, so every failure here is an empty answer, and
// this file is the only one to change when it breaks.

const playerUrl = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
const client = { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" }

const timeoutMs = 10_000
const maxResponseBytes = 2 * 1024 * 1024
// About 4k tokens: a Short's speech fits many times over, and a long video's
// recipe is usually stated early.
export const maxTranscriptLength = 15_000

const Track = Schema.Struct({
  baseUrl: Schema.String,
  languageCode: Schema.String,
  kind: Schema.optional(Schema.String),
})
type Track = typeof Track.Type

const Player = Schema.Struct({
  streamingData: Schema.optional(
    Schema.Struct({
      adaptiveFormats: Schema.optional(
        Schema.Array(
          Schema.Struct({
            audioTrack: Schema.optional(
              Schema.Struct({
                id: Schema.optional(Schema.String),
                displayName: Schema.optional(Schema.String),
              }),
            ),
          }),
        ),
      ),
    }),
  ),
  captions: Schema.optional(
    Schema.Struct({
      playerCaptionsTracklistRenderer: Schema.optional(
        Schema.Struct({ captionTracks: Schema.optional(Schema.Array(Track)) }),
      ),
    }),
  ),
})

const Timedtext = Schema.Struct({
  events: Schema.optional(
    Schema.Array(
      Schema.Struct({
        segs: Schema.optional(
          Schema.Array(Schema.Struct({ utf8: Schema.optional(Schema.String) })),
        ),
      }),
    ),
  ),
})

const json = async (response: Response): Promise<unknown> => {
  if (!response.ok || response.body === null) return null
  const chunks: Array<Uint8Array> = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maxResponseBytes) return null
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

// "en-US", or an audio track id such as "en-US.4", as "en".
const language = (code: string) => code.split(/[-.]/)[0].toLowerCase()

// The language the video was recorded in. A video with AI-dubbed audio has an
// auto-generated caption track for every dub, so the original is the audio
// track YouTube names as such ("English (US) original", in English for
// `hl: "en"`). Otherwise a lone auto-generated track is in the spoken
// language. Several of them and no original audio track settle nothing.
const spokenLanguage = (
  player: typeof Player.Type,
  tracks: ReadonlyArray<Track>,
): string | undefined => {
  const original = player.streamingData?.adaptiveFormats?.find((format) =>
    format.audioTrack?.displayName?.toLowerCase().includes("original"),
  )?.audioTrack?.id
  if (original !== undefined) return language(original)
  const generated = tracks.filter((track) => track.kind === "asr")
  return generated.length === 1
    ? language(generated[0].languageCode)
    : undefined
}

// Manual captions before auto-generated ones, then the video's language before
// English. Without either, a manual track is still the best guess, and any
// track is better than none.
const pickTrack = (
  tracks: ReadonlyArray<Track>,
  spoken: string | undefined,
): Track | undefined => {
  const preferred = [spoken, "en"]
  const rank = (track: Track) => {
    const index = preferred.indexOf(language(track.languageCode))
    return index === -1
      ? undefined
      : (track.kind === "asr" ? preferred.length : 0) + index
  }
  const ranked = tracks
    .flatMap((track) => {
      const r = rank(track)
      return r === undefined ? [] : [{ track, r }]
    })
    .sort((a, b) => a.r - b.r)
  return (
    ranked[0]?.track ??
    tracks.find((track) => track.kind !== "asr") ??
    tracks[0]
  )
}

// Caption events as one paragraph, without sound cues such as "[Music]", cut
// at a word near the limit. A cue can't contain "[", which keeps the cleanup
// linear: with it, every unclosed "[" would rescan the rest of the text.
const flatten = (timedtext: typeof Timedtext.Type): string | null => {
  const text = (timedtext.events ?? [])
    .map((event) => (event.segs ?? []).map((seg) => seg.utf8 ?? "").join(""))
    .join(" ")
    .replace(/\[[^[\]]*\]|♪/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (text === "") return null
  if (text.length <= maxTranscriptLength) return text
  const cut = text.slice(0, maxTranscriptLength - 2)
  const space = cut.lastIndexOf(" ")
  return `${space > 0 ? cut.slice(0, space) : cut} …`
}

// The video's spoken transcript as plain text, or null when there is none or
// it could not be read for any reason.
export const fetchYouTubeTranscript = async (
  id: string,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | null> => {
  try {
    const signal = AbortSignal.timeout(timeoutMs)
    const player = Schema.decodeUnknownOption(Player)(
      await json(
        await fetch(playerUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ context: { client }, videoId: id }),
          signal,
          redirect: "error",
        }),
      ),
    )
    if (Option.isNone(player)) return null
    const tracks =
      player.value.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
      []
    const track = pickTrack(tracks, spokenLanguage(player.value, tracks))
    if (track === undefined) return null
    const url = new URL(track.baseUrl, "https://www.youtube.com")
    if (url.origin !== "https://www.youtube.com") return null
    url.searchParams.set("fmt", "json3")
    const timedtext = Schema.decodeUnknownOption(Timedtext)(
      await json(await fetch(url, { signal, redirect: "error" })),
    )
    return Option.isSome(timedtext) ? flatten(timedtext.value) : null
  } catch {
    return null
  }
}
