import { test } from "node:test"
import * as assert from "node:assert/strict"
import { createYouTubeHandler } from "../server/youtube"

const id = "abcdefghijk"
const snippet = {
  title: "Potatoes",
  channelTitle: "Potato Kitchen",
  description: "1kg potatoes\nBoil and roast.",
  thumbnails: {
    default: { url: "https://i.ytimg.com/small.jpg", width: 120, height: 90 },
    high: { url: "https://i.ytimg.com/large.jpg", width: 480, height: 360 },
  },
}

test("public video metadata uses the authenticated API, sharing and expiring cached requests", async () => {
  let calls = 0
  let now = 0
  const handler = createYouTubeHandler({
    apiKey: "server-secret",
    now: () => now,
    fetch: async (input, init) => {
      const url = new URL(String(input))
      if (url.origin === "https://www.youtube.com")
        return new Response(null, { status: 404 })
      calls++
      assert.equal(url.origin, "https://www.googleapis.com")
      assert.equal(url.pathname, "/youtube/v3/videos")
      assert.equal(url.searchParams.get("part"), "snippet")
      assert.equal(url.searchParams.get("id"), id)
      assert.equal(url.searchParams.has("key"), false)
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "server-secret",
      )
      assert.ok(init?.signal)
      return Response.json({ items: [{ id, snippet }] })
    },
  })
  const [first, concurrent] = await Promise.all([handler(id), handler(id)])
  assert.deepEqual(first, concurrent)
  assert.equal(first.status, 200)
  assert.deepEqual(JSON.parse(first.body), {
    _tag: "Video",
    video: {
      title: "Potatoes",
      channel: "Potato Kitchen",
      description: "1kg potatoes\nBoil and roast.",
      thumbnail: "https://i.ytimg.com/large.jpg",
      transcript: null,
    },
  })
  assert.doesNotMatch(JSON.stringify(first), /server-secret/)
  await handler(id)
  assert.equal(calls, 1)
  now = 300_001
  await handler(id)
  assert.equal(calls, 2)
  assert.equal((await handler("bad/id")).status, 400)
  assert.equal(calls, 2)
})

test("API failures are actionable, never leak credentials, and never fall back to scraping", async () => {
  for (const [status, body, message] of [
    [403, { error: { errors: [{ reason: "quotaExceeded" }] } }, /quota/i],
    [
      400,
      { error: { message: "bad key server-secret" } },
      /key|configuration/i,
    ],
    [200, { items: [] }, /private|unavailable/i],
    [200, { items: [{ id, snippet: {} }] }, /metadata/i],
    [503, {}, /temporarily/i],
  ] as const) {
    let calls = 0
    const handler = createYouTubeHandler({
      apiKey: "server-secret",
      fetch: async () => {
        calls++
        return Response.json(body, { status })
      },
    })
    const result = await handler(id)
    assert.equal(JSON.parse(result.body)._tag, "Unavailable")
    assert.match(JSON.parse(result.body).reason, message)
    assert.doesNotMatch(result.body, /server-secret/)
    assert.equal(calls, 1)
  }
})

test("a hostile caption track is cleaned quickly and stays within the transcript cap", async () => {
  const handler = createYouTubeHandler({
    apiKey: "server-secret",
    fetch: async (input) => {
      const url = new URL(String(input))
      if (url.origin === "https://www.googleapis.com")
        return Response.json({ items: [{ id, snippet }] })
      if (url.pathname === "/youtubei/v1/player")
        return Response.json({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: "https://www.youtube.com/api/timedtext?v=x",
                  languageCode: "en",
                },
              ],
            },
          },
        })
      // Unclosed cue brackets made the cleanup quadratic: 14s for these.
      return Response.json({
        events: [{ segs: [{ utf8: `${"[".repeat(100_000)} olive oil` }] }],
      })
    },
  })
  const start = Date.now()
  const result = await handler(id)
  assert.ok(Date.now() - start < 2_000)
  const { video } = JSON.parse(result.body)
  assert.equal(video.description, "1kg potatoes\nBoil and roast.")
  assert.ok(video.transcript.length <= 15_000)
})
